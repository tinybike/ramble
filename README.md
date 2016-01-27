Ramble
======

[![Build Status](https://travis-ci.org/AugurProject/ramble.svg)](https://travis-ci.org/AugurProject/ramble)
[![Coverage Status](https://coveralls.io/repos/AugurProject/ramble/badge.svg?branch=master&service=github)](https://coveralls.io/github/AugurProject/ramble?branch=master)
[![npm version](https://badge.fury.io/js/ramble.svg)](http://badge.fury.io/js/ramble)

Basic decentralized comments and metadata.  Uses an Ethereum contract for lookups and IPFS for distributed data storage.

Usage
-----
```
$ npm install ramble
```
To use Ramble in Node.js, simply require it:
```javascript
var ramble = require("ramble");
```
A minified, browserified file `dist/ramble.min.js` is included for use in the browser.  Including this file attaches a `ramble` object to `window`:
```html
<script src="dist/ramble.min.js" type="text/javascript"></script>
```

Tests
-----

```
$ mocha
```
