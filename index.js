const {BaseCache} = require('./BaseCache');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const {compress, decompress} = require('@mongodb-js/zstd');

let writeCount = 0;
const RANDOM = Math.random().toString(36).substring(2);

async function compressMaybe(buffer) {
	if (buffer.length < 256) return buffer;
	return compress(buffer, 3);
}

async function decompressMaybe(buffer) {
	if (buffer.length < 64) return buffer;
	if (buffer[3] === 0xFD && buffer[2] === 0x2F && buffer[1] === 0xB5 && buffer[0] === 0x28) {
		return decompress(buffer);
	}
	return buffer;
}

function sha1(str) {
	return crypto.createHash('sha1').update(str, 'binary').digest('base64url');
}

class FileCache extends BaseCache {
	static keySeparator = '/';
	static setCacheDir(cacheDir) {
		this.backend.cacheDir = path.resolve(cacheDir);
	}

	static backend = {
		cacheDir: `${process.cwd()}/cache`,

		keyToPath(key) {
			if (key.length > 2048) {
				key = sha1(key);
			}
			else {
				key = key.replace(/[\s`!@#$%^&*()=+[\]{}\\|:;'",<>/?]+/g, '/').replace(/\/$/, '');
				if (key.length > 200) {
					const lastPart = key.match(/\/[^/]*$/, key);
					if (lastPart && lastPart[0].length > 200) {
						key = key.replace(/\/[^/]*$/, '/' + sha1(lastPart[0]));
					}	
				}
			}
			return this.cacheDir + '/' + key;
		},
	
		keyToFile(key) {
			return `${this.keyToPath(key)}.fc`;
		},

		/**
		 * get the value from the real cache
		 * @param {string} [key] key to get
		 * @returns {Promise<CacheValue>} value object from the cache
		 */
		async get(key) {
			try {
				return JSON.parse(await decompressMaybe(
					await fs.readFile(this.keyToFile(key))
				));
			}
			catch (e) {
				if (e.code === 'ENOENT') {
					return undefined;
				}
				throw e;
			}
		},

		/**
		 * set the value in the real cache
		 * @param {string} [key] key to set
		 * @param {any} [value] value to set
		 * @param {object} 
		 * @returns {Promise<any>}
		 */
		async set(key, value, {t, c} = {}) {
			const fileName = this.keyToFile(key);
			const dir = path.dirname(fileName);
			const tempFileName = `${dir}/_tmp_${writeCount++}_${RANDOM}_${path.basename(fileName)}`;
			await fs.mkdir(dir, {recursive: true});
			await fs.writeFile(tempFileName, await compressMaybe(
				Buffer.from(JSON.stringify({t, c, v: value}))
			));
			await fs.rename(tempFileName, fileName);
		},

		/**
		 * check whether the cache has a value
		 * @param {string} [key] key to check
		 * @returns {Promise<boolean>}
		 */
		async has(key) {
			try {
				await fs.lstat(this.keyToFile(key));
				return true;
			}
			catch (e) {
				return false;
			}
		},

		/**
		 * check keys from the cache
		 * @param {Array<string>} [keys] keys to delete
		 * @returns {Promise<boolean>}
		 */
		async del(keys) {
			await Promise.all(keys.map((key) => fs.unlink(this.keyToFile(key)).catch(e => {})));
		},

		/**
		 * clear the cache
		 * @param {Array<string>} [keys] keys to delete
		 * @returns {Promise<boolean>}
		 */
		async clear(keyPath) {
			await fs.rm(this.keyToPath(keyPath), {
				force: true,
				maxRetries: 10,
				recursive: true,
			});
		},

		/**
		 * mark the keys as stale
		 * @param {Array<string>} [keys] keys to mark stale
		 * @returns {Promise<boolean>}
		 */
		async touch(keys, {t, c}) {
			await Promise.all(keys.map(async (key) => {
				try {
					const val = await this.get(key);
					if (!val) return;
					await this.set(key, val.v, {t: t ?? val.t, c: c ?? val.c});
				}
				catch (e) {
					// ignore error
				}
			}));
		},
	};
}

module.exports = {
	FileCache
};
