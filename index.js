/**
 * IPFS/Ethereum-powered decentralized comments.
 * @author Jack Peterson (jack@tinybike.net)
 */

"use strict";

var NODE_JS = (typeof module !== "undefined") && process && !process.browser;

var async = require("async");
var connector = require("ethereumjs-connect");
var multihash = require("multi-hash");
var abi = require("augur-abi");
var rpc = require("ethrpc");
var errors = require("augur-contracts").errors;
var ipfsAPI;
if (global) {
    ipfsAPI = global.ipfsAPI || require("ipfs-api");
} else if (window) {
    ipfsAPI = window.ipfsAPI || require("ipfs-api");
} else {
    ipfsAPI = require("ipfs-api");
}

function isFunction(f) {
    return Object.prototype.toString.call(f) === "[object Function]";
}

var constants = {
    IPFS_LOCAL: {host: "localhost", port: "5001", protocol: "http"},
    IPFS_REMOTE: [
        {host: "ipfs1.augur.net", port: "443", protocol: "https"},
        {host: "ipfs2.augur.net", port: "443", protocol: "https"},
        {host: "ipfs4.augur.net", port: "443", protocol: "https"},
        {host: "ipfs5.augur.net", port: "443", protocol: "https"}
    ]
};

var IPFS_DEFAULT = constants.IPFS_LOCAL;
var NUM_NODES = constants.IPFS_REMOTE.length;
var REMOTE = null;
if ((NODE_JS || document.location.protocol) === "https:") {
    IPFS_DEFAULT = constants.IPFS_REMOTE[0];
    REMOTE = IPFS_DEFAULT;
}

module.exports = {

    debug: false,

    ipfs: ipfsAPI(IPFS_DEFAULT),

    invoke: null,

    context: rpc,

    rpc: rpc,

    constants: constants,

    connector: connector,

    remote: REMOTE,

    remoteNodeIndex: 0,

    remoteNodes: constants.IPFS_REMOTE,

    localNode: (REMOTE) ? null : constants.IPFS_LOCAL,

    getLogs: function (filter, f) {
        return rpc.broadcast(rpc.marshal("getLogs", filter), f);
    },

    useLocalNode: function (url) {
        if (url) this.localNode = url;
        this.ipfs = ipfsAPI(this.localNode);
        this.remote = null;
        return this.localNode;
    },

    useRemoteNode: function (url) {
        if (url) {
            this.remote = url;
            this.remoteNodes.push(url);
            this.remoteNodeIndex = this.remoteNodes.length - 1;
            ++NUM_NODES;
        }
        this.remote = this.remoteNodes[this.remoteNodeIndex % NUM_NODES];
        this.ipfs = ipfsAPI(this.remote);
        this.localNode = null;
        return this.remote;
    },

    getComment: function (ipfsHash, blockNumber, cb, tries) {
        var self = this;
        tries = tries || 0;
        if (tries > NUM_NODES) return cb(errors.IPFS_GET_FAILURE);
        this.ipfs.cat(ipfsHash, function (err, res) {
            if (err) {
                self.remote = self.remoteNodes[++self.remoteNodeIndex % NUM_NODES];
                self.ipfs = ipfsAPI(self.remote);
                return self.getComment(ipfsHash, blockNumber, cb, ++tries);
            }
            if (!res) return self.getComment(ipfsHash, blockNumber, cb, ++tries);
            self.ipfs.pin.add(ipfsHash, function (e, pinned) {
                var comment;
                if (self.debug) console.log("getComment.pinned:", pinned);
                if (e) {
                    self.remote = self.remoteNodes[++self.remoteNodeIndex % NUM_NODES];
                    self.ipfs = ipfsAPI(self.remote);
                    return self.getComment(ipfsHash, blockNumber, cb, ++tries);
                }
                if (res.readable) {
                    comment = "";
                    res.on("data", function (data) {
                        comment += data;
                    });
                    res.on("end", function () {
                        comment = JSON.parse(comment.slice(comment.indexOf("{"), comment.lastIndexOf("}") + 1));
                        if (blockNumber === null || blockNumber === undefined) {
                            return cb(null, {
                                ipfsHash: ipfsHash,
                                author: comment.author,
                                message: comment.message || ""
                            });
                        }
                        self.rpc.getBlock(blockNumber, true, function (block) {
                            if (!block || block.error) return cb(block);
                            cb(null, {
                                ipfsHash: ipfsHash,
                                author: comment.author,
                                message: comment.message || "",
                                blockNumber: parseInt(blockNumber),
                                time: parseInt(block.timestamp)
                            });
                        });
                    });
                } else {
                    comment = JSON.parse(res.slice(res.indexOf("{"), res.lastIndexOf("}") + 1));
                    if (blockNumber === null || blockNumber === undefined) {
                        return cb(null, {
                            ipfsHash: ipfsHash,
                            author: comment.author,
                            message: comment.message || ""
                        });
                    }
                    self.rpc.getBlock(blockNumber, true, function (block) {
                        if (!block || block.error) return cb(block);
                        cb(null, {
                            ipfsHash: ipfsHash,
                            author: comment.author,
                            message: comment.message || "",
                            blockNumber: parseInt(blockNumber),
                            time: parseInt(block.timestamp)
                        });
                    });
                }
            });
        });
    },

    getMetadata: function (ipfsHash, cb, tries) {
        var self = this;
        tries = tries || 0;
        if (tries > NUM_NODES) return cb(errors.IPFS_GET_FAILURE);
        this.ipfs.cat(ipfsHash, function (err, res) {
            var metadata;
            if (err) {
                self.remote = self.remoteNodes[++self.remoteNodeIndex % NUM_NODES];
                self.ipfs = ipfsAPI(self.remote);
                return self.getMetadata(ipfsHash, cb, ++tries);
            }
            if (!res) return self.getMetadata(ipfsHash, cb, ++tries);
            self.ipfs.pin.add(ipfsHash, function (e, pinned) {
                if (self.debug) console.log("getMetadata.pinned:", pinned);
                if (e) {
                    self.remote = self.remoteNodes[++self.remoteNodeIndex % NUM_NODES];
                    self.ipfs = ipfsAPI(self.remote);
                    return self.getMetadata(ipfsHash, cb, ++tries);
                }
                if (res.readable) {
                    metadata = "";
                    res.on("data", function (data) {
                        metadata += data;
                    });
                    res.on("end", function () {
                        metadata = JSON.parse(metadata.slice(metadata.indexOf("{"), metadata.lastIndexOf("}") + 1));
                        if (metadata.image) {
                            metadata.image = self.ipfs.Buffer(metadata.image);
                        }
                        cb(null, metadata);
                    });
                } else {
                    metadata = JSON.parse(res.slice(res.indexOf("{"), res.lastIndexOf("}") + 1));
                    if (metadata.image && metadata.image.constructor === Array) {
                        metadata.image = self.ipfs.Buffer(metadata.image);
                    }
                    cb(null, metadata);
                }
            });
        });
    },

    getMarketComments: function (market, options, cb) {
        if (!cb && isFunction(options)) {
            cb = options;
            options = null;
        }
        options = options || {};
        if (!market || !isFunction(cb)) return errors.PARAMETER_NUMBER_ERROR;
        var self = this;
        this.getLogs({
            fromBlock: options.fromBlock || "0x1",
            toBlock: options.toBlock || "latest",
            address: this.connector.contracts.comments,
            topics: ["comment"]
        }, function (logs) {
            if (!logs || (logs && (logs.constructor !== Array || !logs.length))) {
                return cb(errors.IPFS_GET_FAILURE);
            }
            if (logs.error) return cb(logs);
            if (!logs || !market) return cb(errors.IPFS_GET_FAILURE);
            var numLogs = logs.length;
            if (options.numComments && options.numComments < numLogs) {
                logs = logs.slice(numLogs - options.numComments, numLogs);
            }
            var comments = [];
            market = abi.bignum(abi.unfork(market));
            async.eachSeries(logs, function (thisLog, nextLog) {
                if (!thisLog || !thisLog.topics) return nextLog();
                if (!abi.bignum(abi.unfork(thisLog.topics[1])).eq(market)) {
                    return nextLog();
                }
                var ipfsHash = multihash.encode(abi.unfork(thisLog.data));
                var blockNumber = abi.hex(thisLog.blockNumber);
                self.getComment(ipfsHash, blockNumber, function (err, comment) {
                    if (err) return nextLog(err);
                    if (!comment) return nextLog(errors.IPFS_GET_FAILURE);
                    if (comment.error) return nextLog(errors.IPFS_GET_FAILURE);
                    if (comment.author && comment.message && comment.time) {
                        comments.push(comment);
                    }
                    nextLog();
                });
            }, function (err) {
                if (err) return cb(err);
                comments.reverse();
                cb(null, comments);
            });
        });
    },

    getMarketMetadata: function (market, options, cb) {
        if (!cb && isFunction(options)) {
            cb = options;
            options = null;
        }
        options = options || {};
        if (!market || !isFunction(cb)) return errors.PARAMETER_NUMBER_ERROR;
        var self = this;
        this.getLogs({
            fromBlock: options.fromBlock || "0x1",
            toBlock: options.toBlock || "latest",
            address: this.connector.contracts.comments,
            topics: ["metadata"]
        }, function (logs) {
            if (!logs || (logs && (logs.constructor !== Array || !logs.length))) {
                return cb(errors.IPFS_GET_FAILURE);
            }
            if (logs.error) return cb(logs);
            if (!logs || !market) return cb(errors.IPFS_GET_FAILURE);
            var numLogs = logs.length;
            if (options.numComments && options.numComments < numLogs) {
                logs = logs.slice(numLogs - options.numComments, numLogs);
            }
            var metadataList = [];
            market = abi.bignum(abi.unfork(market));
            async.eachSeries(logs, function (thisLog, nextLog) {
                if (!thisLog || !thisLog.topics) return nextLog();
                if (!abi.bignum(abi.unfork(thisLog.topics[1])).eq(market)) {
                    return nextLog();
                }
                var ipfsHash = multihash.encode(abi.unfork(thisLog.data));
                self.getMetadata(ipfsHash, function (err, metadata) {
                    if (err) return nextLog(err);
                    if (!metadata) return nextLog(errors.IPFS_GET_FAILURE);
                    if (metadata.error) return nextLog(errors.IPFS_GET_FAILURE);
                    metadataList.push(metadata);
                    nextLog();
                });
            }, function (err) {
                if (err) return cb(err);
                metadataList.reverse();
                cb(null, metadataList);
            });
        });
    },

    // pin data to all remote nodes
    broadcastPin: function (data, ipfsHash, cb) {
        var self = this;
        var pinningNodes = [];
        cb = cb || function () {};
        var ipfsNodes = new Array(NUM_NODES);
        for (var i = 0; i < NUM_NODES; ++i) {
            ipfsNodes[i] = ipfsAPI(this.remoteNodes[i]);
        }
        async.forEachOfSeries(ipfsNodes, function (node, index, nextNode) {
            node.add(data, function (err, files) {
                if ((err && err.code) || !files || files.error) {
                    return nextNode(err || files);
                }
                node.pin.add(ipfsHash, function (err, pinned) {
                    if (err && err.code) return nextNode(err);
                    if (!pinned) return nextNode(errors.IPFS_ADD_FAILURE);
                    if (pinned.error) return nextNode(pinned);
                    if (pinned.toString().indexOf("<html>") === -1) {
                        pinningNodes.push(self.remoteNodes[index]);
                    }
                    return nextNode();
                });
            });
        }, function (err) {
            if (err) return cb(err);
            cb(null, pinningNodes);
        });
    },

    // comment: {marketId, message, author}
    addMarketComment: function (comment, onSent, onSuccess, onFailed) {
        var self = this;
        var tx = {
            to: this.connector.contracts.comments,
            from: this.connector.from,
            method: "addComment",
            signature: "ii",
            send: true,
            returns: "number",
            invocation: {invoke: this.invoke, context: this.context}
        };
        var data = this.ipfs.Buffer(JSON.stringify(comment));
        this.ipfs.add(data, function (err, files) {
            if (self.debug) console.log("ipfs.add:", files);
            if (err || !files || files.error) {
                self.remote = self.remoteNodes[++self.remoteNodeIndex % NUM_NODES];
                self.ipfs = ipfsAPI(self.remote);
                return self.addMarketComment(comment, onSent, onSuccess, onFailed);
            }
            var ipfsHash = (files.constructor === Array) ? files[0].Hash : files.Hash;

            // pin data to the active node
            self.ipfs.pin.add(ipfsHash, function (err, pinned) {
                if (self.debug) console.log("ipfs.pin.add:", pinned);
                if (err) return onFailed(err);
                tx.params = [
                    abi.unfork(comment.marketId, true),
                    abi.hex(multihash.decode(ipfsHash), true)
                ];
                self.rpc.transact(tx, function (res) {
                    self.broadcastPin(data, ipfsHash);
                    onSent(res);
                }, onSuccess, onFailed);
            });
        });
    },

    // metadata: {image: blob, details: text, links: url array}
    addMetadata: function (metadata, onSent, onSuccess, onFailed) {
        var self = this;
        var tx = {
            to: this.connector.contracts.comments,
            from: this.connector.from,
            method: "addMetadata",
            signature: "ii",
            send: true,
            returns: "number",
            invocation: {invoke: this.invoke, context: this.context}
        };
        var data = this.ipfs.Buffer(JSON.stringify(metadata));
        this.ipfs.add(data, function (err, files) {
            if (self.debug) console.log("ipfs.add:", files);
            if (err || !files || files.error) {
                self.remote = self.remoteNodes[++self.remoteNodeIndex % NUM_NODES];
                self.ipfs = ipfsAPI(self.remote);
                return self.addMetadata(metadata, onSent, onSuccess, onFailed);
            }
            var ipfsHash = (files.constructor === Array) ? files[0].Hash : files.Hash;

            // pin data to the active node
            self.ipfs.pin.add(ipfsHash, function (err, pinned) {
                if (self.debug) console.log("ipfs.pin.add:", pinned);
                if (err) return onFailed(err);
                tx.params = [
                    abi.unfork(metadata.marketId, true),
                    abi.hex(multihash.decode(ipfsHash), true)
                ];
                self.rpc.transact(tx, function (res) {
                    self.broadcastPin(data, ipfsHash);
                    onSent(res);
                }, onSuccess, onFailed);
            });
        });
    }
};
