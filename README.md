## file-cache
File Based Cache for Node.js

## Install
```sh
npm install @hkk12369/file-cache
# OR
yarn add @hkk12369/file-cache
```

## Usage
```js
const {FileCache} = require('@hkk12369/file-cache');

// set cache directory
FileCache.setCacheDir('./cache');

const cache = new FileCache('api');
// set any key
await cache.set('key', 'value', {ttl: '1d'});
// get key
await cache.get('key');
// delete key
await cache.del('key');
// get key or set if not exists
await cache.getOrSet('key', async () => {
    return 'value';
}, {ttl: '1d'});
// get stale key and set in background if stale
await cache.getOrSet('key', async () => {
    return 'value';
}, {ttl: '30d', staleTTL: '1d'});
```
