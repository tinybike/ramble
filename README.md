Ramble
======

Basic decentralized comments.  Uses an Ethereum contract for lookups and IPFS for distributed data storage.

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
