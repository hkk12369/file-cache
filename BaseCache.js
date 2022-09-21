// basecache is based in RedisCache from 'sm-utils'
// @see: https://github.com/smartprix/sm-utils/blob/master/src/RedisCache.js

const timestring = require('timestring');

const DELETE = Symbol('DELETE');

const getting = new Map();
const setting = new Map();
const getOrSetting = new Map();
const getOrSettingStale = new Map();

async function _withDefault(promise, defaultValue) {
	const value = await promise;
	if (value === undefined) return defaultValue;
	return value;
}

async function _withDefaultOpts(promise, opts = {}) {
	const value = await promise;
	if (value === undefined) return opts.default;
	return opts.process ? opts.process(value) : value;
}

function parseTTL(ttl) {
	if (typeof ttl === 'string') return timestring(ttl, 'ms');
	return ttl;
}

function setCtxStale(ctx, value) {
    if (ctx.staleTTL) {
        if (value.c < Date.now() - ctx.staleTTL) {
            ctx.isStale = true;
        }
    }
}

/**
 * @typedef {object} BaseCacheOptions
 * @param {object} [logger]
 *   Custom logger to use instead of console
 */

/**
 * @typedef {object} CacheValue
 * @param {any} [v]
 *   actual stored value
 * @param {int} [c]
 *   time when the value was created
 * @param {int} [t]
 *   ttl of the value
 */

/**
 * @typedef {object} CacheSetRealOptions
 * @param {int} [t=0]
 *   ttl of the value
 * @param {int} [c=0]
 *   time when the value was created
 */

/**
 * @typedef {object} CacheSetOpts
 * @property {number|string|undefined} ttl in ms / timestring ('1d 3h') default: 0
 * @property {number|string|undefined} staleTTL in ms / timestring ('1d 3h')
 *  set this if you want stale values to be returned and generation in the background
 *  values will be considered stale after this time period
 * @property {boolean} [requireResult=true]
 *  require result to be calculated if the key does not exist
 *  only valid if stale ttl is given
 *  it true, this will generate value in foreground if the key does not exist
 *  if false, this will return undefined and
 *    generate value in background if the key does not exist
 * @property {boolean} [freshResult=false]
 *  always return fresh value
 *  only valid if stale ttl is given
 *  if true, this will generate value in foreground if value is stale
 *  if false, this will generate value in background (and return stale value) if value is stale
 * @property {boolean} [forceUpdate=false]
 *  get fresh results (ignoring ttl & staleTTL) and update cache
 * @property {function(any):(Promise<any> | any)} fromJSON function to parse value fetched from cache
 * @property {function(any):(Promise<any> | any)} process function to process value before saving in both cache & localCache
 * @property {function(any):(any)} [toJSON]
 *  fn to convert the value to JSON before saving into cache
 * @property {any} default default value to return in case if value is undefined
 */

/**
 * @typedef {object} CacheGetOpts
 * @property {function(any):(Promise<any> | any)} [fromJSON] fn to parse value fetched from cache
 * @property {function(any):(Promise<any> | any)} [process] fn to process the result
 *  - process gets called after parsing the value
 *  - process also gets called before saving the value in localCache, while fromJSON does not
 */

class CacheBackend {
	static KEY_SEPARATOR = '/';

	constructor(opts = {}) {
		this.cache = opts.cache;
		this.CacheClass = this.cache.constructor;
	}

	/**
	 * get the value from the real cache
	 * @param {string} [key] key to get
	 * @returns {Promise<CacheValue>} value object from the cache
	 */
	 async get(key) {
		return null;
	}

	/**
	 * set the value in the real cache
	 * @param {string} [key] key to set
	 * @param {any} [value] value to set
	 * @param {object}
	 * @returns {Promise<any>}
	 */
	async set(key, value, {t, c} = {}) {
		return null;
	}

	/**
	 * check whether the cache has a value
	 * @param {string} [key] key to check
	 * @returns {Promise<boolean>}
	 */
	async has(key) {
		return false;
	}

	/**
	 * check keys from the cache
	 * @param {Array<string>} [keys] keys to delete
	 * @returns {Promise<boolean>}
	 */
	async del(keys) {
		return false;
	}

	/**
	 * clear the cache
	 * @param {Array<string>} [keys] keys to delete
	 * @returns {Promise<boolean>}
	 */
	async clear(keyPath) {
		return false;
	}

	/**
	 * mark the keys as stale
	 * @param {Array<string>} [keys] keys to mark stale
	 * @returns {Promise<boolean>}
	 */
	async touch(keys, {t, c} = {}) {
		return false;
	}
}


class BaseCache {
    static logger = console;
    static _bypass = false;
	static CACHE_ID = 'HC';
    static GLOBAL_PREFIX = 'a';
	// Backend need to be overridden for each implmeneting class
    static Backend = CacheBackend;

	static get KEY_SEPARATOR() {
		return this.Backend.KEY_SEPARATOR;
	}

    static setLogger(logger) {
        this.logger = logger;
    }

	/**
	 * @param {string} prefix
	 * @param {BaseCacheOptions} [options={}] Cache Options
	 */
	constructor(prefix, options = {}) {
        const cls = this.constructor;
		this.KEY_SEPARATOR = cls.KEY_SEPARATOR;
		this.prefix = prefix;
        this.logger = options.logger ?? cls.logger;
		this.keyPath = [
			cls.CACHE_ID,
			cls.GLOBAL_PREFIX,
			this.prefix,
		].join(this.KEY_SEPARATOR);
		this.backend = new cls.Backend({
			cache: this,
		});
	}

	_fetching(map, key, value) {
		const prefixedKey = this._key(key);
		if (value === undefined) {
			return map.get(prefixedKey);
		}
		if (value === DELETE) {
			map.delete(prefixedKey);
			return undefined;
		}

		map.set(prefixedKey, value);
		return value;
	}

	_getting(key, value) {
		return this._fetching(getting, key, value);
	}

	_setting(key, value) {
		return this._fetching(setting, key, value);
	}

	_getOrSetting(key, value) {
		return this._fetching(getOrSetting, key, value);
	}

	_getOrSettingStale(key, value) {
		return this._fetching(getOrSettingStale, key, value);
	}

    /**
     * get prefixed key
     * @param {string} key 
     * @returns {string}
     */
	_key(key) {
		return `${this.keyPath}${this.KEY_SEPARATOR}${key}`;
	}

    async _get(key) {
        try {
            const val = await this.backend.get(this._key(key));
            if (val && val.t) {
                if (val.c < Date.now() - val.t) {
                    this._del(key);
                    return undefined;
                }
            }
            return val;
        }
        catch (e) {
            this.logger.error(e);
            return undefined;
        }
    }

    async _set(key, value, ttl, createdAt) {
        if (value === undefined) return true;
        try {
            await this.backend.set(this._key(key), value, {
                t: ttl, 
                c: createdAt || Date.now(),
            });
            return true;
        }
        catch (e) {
            this.logger.error(e);
            return false;
        }
    }

    async _has(key) {
        try {
            return this.backend.has(this._key(key));
        }
        catch (e) {
            this.logger.error(e);
            return false;
        }
    }

    async _del(key) {
		const keys = (Array.isArray(key) ? key : [key]).map(k => this._key(k));
        try  {
            await this.backend.del(keys);
        }
        catch (e) {
            this.logger.error(e);
        }
	}

    async _markStale(key) {
        const keys = (Array.isArray(key) ? key : [key]).map(k => this._key(k));
        try {
            await this.backend.touch(keys, {c: 0});
        }
        catch (e) {
            this.logger.error(e);
        }
    }

    async _clear() {
        try {
            await this.backend.clear(this.keyPath);
        }
        catch (e) {
            this.logger.error(e);
        }
	}

    async _setBoth(key, value, options = {}) {
		if (value === undefined) return undefined;
		const ttl = parseTTL((typeof options === 'object') ? options.ttl : options);
		const localVal = options.process ? (await options.process(value)) : value;
		await this._set(key, value, ttl, Date.now());
		return localVal;
	}

	/**
	 * gets a value from the cache immediately without waiting
	 * @param {string} key
	 * @param {any} [defaultValue]
	 * @param {CacheGetOpts} [options]
	 * @returns {Promise<any>}
	 */
	async getStale(key, defaultValue = undefined, options = {}, ctx = {}) {
        const gettingPromise = this._getting(key);
        if (gettingPromise) {
            const value = await gettingPromise;
            if (value === undefined) return defaultValue;
            return value;
        }

        const promise = this._get(key).then(async (value) => {
            if (value === undefined) return value;
            setCtxStale(ctx, value);

            let val = value.v;
            if (options.fromJSON) {
                val = await options.fromJSON(val);
            }
            if (options.process) {
                val = await options.process(val);
            }
            return val;
        });

        this._getting(key, promise);
        const value = await promise;
        this._getting(key, DELETE);

        if (value === undefined) return defaultValue;
        return value;
	}
	
	/**
	 * gets a value from the cache
	 * @param {string} key
	 * @param {any} [defaultValue]
	 * @param {CacheGetOpts} [options]
	 * @returns {Promise<any>}
	 */
	async get(key, defaultValue = undefined, options = {}) {
		const settingPromise = this._setting(key);
		if (settingPromise) {
			return _withDefault(settingPromise, defaultValue);
		}

		return this.getStale(key, defaultValue, options);
	}

    /**
	 * checks if a key exists in the cache
	 * @param {string} key
	 * @returns {boolean}
	 */
	async has(key) {
		return this._has(key);
	}

    /**
	 * bypass the cache and compute value directly (useful for debugging / testing)
	 * NOTE: this'll be only useful in getOrSet or memoize, get will still return from cache
	 * @example
	 * let i = 0;
	 * const cache = new Cache();
	 * await cache.getOrSet('a', () => ++i); // => 1
	 * await cache.getOrSet('a', () => ++i); // => 1 (returned from cache)
	 * cache.bypass(); // turn on bypassing
	 * await cache.getOrSet('a', () => ++i); // => 2 (cache bypassed)
	 * await cache.getOrSet('a', () => ++i); // => 3 (cache bypassed)
	 * cache.bypass(false); // turn off bypassing
	 * await cache.getOrSet('a', () => ++i); // => 1 (previous cache item)
	 * @param {boolean} [bypass=true] whether to bypass the cache or not
	 */
	bypass(bypass = true) {
		this._bypass = bypass;
	}

	/**
	 * gets whether the cache is bypassed or not
	 * @returns {boolean}
	 */
	isBypassed() {
        return this._bypass ?? this.constructor._bypass;
	}

	/**
	 * bypass the cache and compute value directly (useful for debugging / testing)
	 * NOTE: Cache.bypass will turn on bypassing for all instances of Cache
	 * For bypassing a particular instance, use [`instance.bypass()`]{@link BaseCache#bypass}
	 * @see [bypass]{@link BaseCache#bypass}
	 * @param {boolean} [bypass=true] default true
	 */
	static bypass(bypass = true) {
		this._bypass = bypass;
	}

	/**
	 * gets whether the cache is bypassed or not
	 * @returns {boolean}
	 */
	static isBypassed() {
		return this._bypass;
	}

    /**
	 * sets a value in the cache
	 * avoids dogpiling if the value is a promise or a function returning a promise
	 * @param {string} key
	 * @param {any} value
	 * @param {number|string|CacheSetOpts} [options={}] ttl in ms/timestring('1d 3h')
	 * or opts (default: 0)
	 * @return {boolean}
	 */
	async set(key, value, options = {}, ctx = {}) {
		try {
			if (value && value.then) {
				// value is a Promise
				// resolve it and then cache it
				this._setting(key, value);
				const resolvedValue = await value;
				ctx.result = await this._setBoth(key, resolvedValue, options);
				this._setting(key, DELETE);
				return true;
			}
			if (typeof value === 'function') {
				// value is a function
				// call it and set the result
				return this.set(key, value(key), options, ctx);
			}
			if (value === undefined) {
				// don't set undefined value
				this.logger.error(`[${this.constructor.name}] [${this.prefix}] attempt to set ${key}=undefined`);
				return false;
			}

			// value is normal
			// just set it in the store
			this._setting(key, Promise.resolve(value));
			ctx.result = await this._setBoth(key, value, options);
			this._setting(key, DELETE);
			return true;
		}
		catch (error) {
			this.logger.error(`[${this.constructor.name}] [${this.prefix}] error while setting key ${key}`, error);
			await this._del(key);
			this._setting(key, DELETE);
			throw error;
		}
	}

    async _getOrSet(key, value, options = {}) {
		// key already exists, return it
		const existingValue = await this.getStale(key, undefined, options);
		if (existingValue !== undefined) {
			return existingValue;
		}

		// no value given, return undefined
		if (value === undefined) {
			return options.default;
		}

		const ctx = {};
		await this.set(key, value, options, ctx);
		return (ctx.result === undefined) ? options.default : ctx.result;
	}

	/**
	 * gets a value from the cache, or sets it if it doesn't exist
	 * this takes care of dogpiling (make sure value is a function to avoid dogpiling)
	 * @param {string} key key to get
	 * @param {any} value value to set if the key does not exist
	 * @param {number|string|CacheSetOpts} [options={}] ttl in ms/timestring('1d 3h') (default: 0)
	 * or opts with fromJSON and ttl
	 * @return {any}
	 */
	async getOrSet(key, value, options = {}) {
		if (options && options.staleTTL) {
			return this._getOrSetStale(key, value, options);
		}

		const settingPromise = this._getOrSetting(key);
		if (settingPromise) {
			// Some other process is still fetching the value
			// Don't dogpile shit, wait for the other process
			// to finish it
			return _withDefaultOpts(settingPromise, options);
		}

		// cache is bypassed, return value directly
		if (this.isBypassed()) {
			if (typeof value === 'function') return _withDefaultOpts(value(key), options);
			return _withDefaultOpts(value, options);
		}

		if (options.forceUpdate) {
			// regenerate value in the foreground
			return this._setWithCheck(key, value, options);
		}

		const promise = this._getOrSet(key, value, options);
		this._getOrSetting(key, promise);
		const result = await promise;
		this._getOrSetting(key, DELETE);
		return result;
	}

	async _setBackground(key, value, options) {
		if (this._getOrSettingStale(key)) return;

		// regenerate value in the background
		this._getOrSettingStale(key, true);
		setTimeout(async () => {
			await this.set(key, value, options).catch((e) => {});
			this._getOrSettingStale(key, DELETE);
		}, 0);
	}

	async _setWithCheck(key, value, options) {
		const settingPromise = this._setting(key);
		if (settingPromise) {
			return _withDefaultOpts(settingPromise, options);
		}

		// regenerate value in the foreground
		const setCtx = {};
		await this.set(key, value, options, setCtx);
		return (setCtx.result === undefined) ? options.default : setCtx.result;
	}

	async _getOrSetStale(key, value, options = {}) {
		// cache is bypassed, return value directly
		if (this.isBypassed()) {
			if (typeof value === 'function') return _withDefaultOpts(value(key), options);
			return _withDefaultOpts(value, options);
		}

		if (options.forceUpdate) {
			// regenerate value in the foreground
			return this._setWithCheck(key, value, options);
		}

		// try to get the value from local cache first
		const ctx = {
			staleTTL: parseTTL(options.staleTTL),
		};

		const existingValue = await this.getStale(key, undefined, options, ctx);
		// true = generate in bg, false = generate in fg, null = don't generate
		let generateInBg = true;
		if (existingValue === undefined) {
			if (options.requireResult !== false || options.freshResult) {
				generateInBg = false;
			}
		}
		else if (ctx.isStale) {
			if (options.freshResult) {
				generateInBg = false;
			}
		}
		else {
			generateInBg = null;
		}

		if (generateInBg === false) {
			// regenerate value in the foreground
			return this._setWithCheck(key, value, options);
		}

		if (generateInBg === true) {
			// regenerate value in the background
			this._setBackground(key, value, options);
		}

		return (existingValue === undefined) ? options.default : existingValue;
	}

    /**
	 * deletes a value from the cache
	 * @param {string|Array<string>} key
	 */
	async del(key) {
		await this._del(key);
	}

    /**
	 * set the key as stale (will cause staleTTL to recompute in background)
	 * @param {string|Array<string>} key
	 */
	async markStale(key) {
		await this._markStale(key);
	}

    /**
	 * clears the cache (deletes all keys)
	 * NOTE: this method might be expensive, so don't use it unless absolutely necessary
	 */
	async clear() {
		await this._clear();
	}

    /**
	 * memoizes a function (caches the return value of the function)
	 * @example
	 * const cachedFn = cache.memoize(expensiveFn);
	 * const result = cachedFn('a', 'b');
	 * @param {function} fn function to memoize
	 * @param {number|string|CacheSetOpts} [options={}] ttl in ms/timestring('1d 3h') (default: 0)
	 * or opts with parse and ttl
	 * @return {function}
	 */
	memoize(fn, options = {}) {
        const keySep = this.KEY_SEPARATOR;
        const key = `m${keySep}${Math.random().toString(36).substring(2)}`;
		return async (...args) => {
			let cacheKey;
			if (options.keyFn) {
				cacheKey = key + keySep + options.keyFn(...args);
			}
			else {
				cacheKey = key + keySep + JSON.stringify(args);
			}
			return this.getOrSet(cacheKey, () => fn(...args), options);
		};
	}
}

module.exports = {
    BaseCache,
};
