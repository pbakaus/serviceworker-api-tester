console.log('SW: Initializing global scope..');

this.addEventListener('install', function(e) {
	console.log("SW: Installed");
});
 
this.addEventListener('activate', function(e) {
	console.log("SW: Activated");
});

/*
 * IndexedDB is heavy, convoluted shit. There, I said it. WAAAAAAH!
 */
var DB = {

	database: null,

	open: function(callback) {

		var version = 4;
		var request = indexedDB.open("endpoints", version);

		// We can only create Object stores in a versionchange transaction.
		request.onupgradeneeded = function(e) {

			var db = e.target.result;

			if(db.objectStoreNames.contains("endpoint")) {
				db.deleteObjectStore("endpoint");
			}

			console.log('creating new object store..');
			var store = db.createObjectStore("endpoint", { keyPath: "route" });

		};

		request.onsuccess = function(e) {
			console.log('successfully opened database..');
			DB.database = e.target.result;
			callback();
		};

	},

	add: function(route, jsonp, matchAll, response) {

		console.log('trying to add endpoint to DB..');

		return new Promise(function(resolve, reject) {

			var db = DB.database;
			var trans = db.transaction(["endpoint"], "readwrite");
			var store = trans.objectStore("endpoint");
			var request = store.put({
				"route": route,
				"jsonp": jsonp,
				"matchAll": matchAll,
				"response" : response
			});

			trans.oncomplete = function(e) {
				console.log('successfully added endpoint to DB!');
				Banana.endpoints[route] = { jsonp: jsonp, matchAll: matchAll, response: response };
				resolve();
			};

			request.onerror = function(e) {
				// Y U ERROR?
				reject();
			};

		});

	},

	remove: function(route) {

		console.log('trying to delete endpoint from DB..');

		return new Promise(function(resolve, reject) {

			var db = DB.database;
			var trans = db.transaction(["endpoint"], "readwrite");
			var store = trans.objectStore("endpoint");
			var request = store.delete(route);

			trans.oncomplete = function(e) {
				console.log('successfully deleted endpoint from DB!');
				resolve();
			};

			request.onerror = function(e) {
				// Y U ERROR?
				reject();
			};

		});

	},

	get: function(callback) {

		var endpoints = {};

		var db = DB.database;
		var trans = db.transaction(["endpoint"], "readwrite");
		var store = trans.objectStore("endpoint");

		// Get everything in the store;
		var keyRange = IDBKeyRange.lowerBound(0);
		var cursorRequest = store.openCursor(keyRange);

		cursorRequest.onsuccess = function(e) {

			var result = e.target.result;
			if(!!result == false) {
				callback(endpoints);
				return;
			}

			endpoints[result.value.route] = { jsonp: result.value.jsonp, matchAll: result.value.matchAll, response: result.value.response };

			result.continue();

		};

	}

};

/*
 * Bi-directional communication channel with a client
 */
var Banana = {

	ports: {},
	endpoints: null,

	open: function(clientId, port) {

		Banana.ports[clientId] = port;

		port.onmessage = function(e) {
			console.log('Client ', clientId, ': Incoming port message', e.data.args);
			Banana.actions[e.data.action].apply(Banana, e.data.args);
		};

	},

	post: function(clientId, message) {
		Banana.ports[clientId].postMessage(message);
	},

	actions: {

		add: function(clientId, promiseId, route, endpoint) {
			DB.add(route, endpoint.jsonp, endpoint.matchAll, endpoint.response).then(function() {
				Banana.post(clientId, { promiseId: promiseId, message: true });
			});
		},

		remove: function(clientId, promiseId, route) {
			DB.remove(route).then(function() {
				Banana.post(clientId, { promiseId: promiseId, message: true });
			});
		},

		get: function(clientId, promiseId) {
			DB.get(function(endpoints) {
				Banana.endpoints = endpoints;
				Banana.post(clientId, { promiseId: promiseId, message: endpoints });
			});
		}

	}

};

// we only run in here once, to initialize communication channels
this.addEventListener('message', function(e) {

	var clientId = e.data;
	console.log('Client ', clientId, ': Incoming global message (to establish message channel)');

	// open bi-directional communication port to client
	Banana.open(clientId, e.ports[0]);

	var cb = function() {
		Banana.post(clientId, 'ping');
	};

	if(!DB.database) {
		DB.open(cb);
	} else {
		cb();
	}
	
});

this.onfetch = function(event) {

	if(!Banana.endpoints) {
		return;
	}

	// Returns a JSONP response if callback is in the query
	function getPreparedResponse(response, jsonp) {

		var callback = event.request.url.match(/&callback=([^&]+)/);
		if(callback && jsonp) {
			return callback[1] + '(' + response + ')';
		} else {
			return response;
		}

	}

	// loose match
	var route = decodeURIComponent(event.request.url.match(/.+?\:\/\/.+?(\/.+?)(?:#|\?|$)/)[1]);

	// strict match (with ?...)
	var fullRoute = decodeURIComponent(event.request.url.match(/.+?\:\/\/.+?(\/.+?)(?:#|$)/)[1]);

	if(fullRoute in Banana.endpoints) {

		console.log('Rerouting due to strict route match (' + fullRoute + ')...');
		event.respondWith(new Response(getPreparedResponse(Banana.endpoints[fullRoute].response, Banana.endpoints[fullRoute].jsonp)));

	} else if(route in Banana.endpoints) {

		if(route === fullRoute || Banana.endpoints[route].matchAll) {
			console.log('Rerouting due to loose route match (' + route + ' maps to ' + fullRoute + ')...');
			event.respondWith(new Response(getPreparedResponse(Banana.endpoints[route].response, Banana.endpoints[route].jsonp)));
		}

	}
};