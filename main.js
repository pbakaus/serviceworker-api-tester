/*
 * Worker communication etc.
 */
var Worker = {

	channel: new MessageChannel(),
	clientId: '' + Date.now(),
	promises: {},

	ready: function() {

		return new Promise(function(resolve, reject) {

			if (!navigator.serviceWorker.controller) {
				navigator.serviceWorker.register('./worker.js')
					.then(function() {
						if(navigator.serviceWorker.controller) {
							resolve();
						} else {
							// still no controller? well, can't do anything about it then.
							reject();
						}
					}, reject);
			} else {
				resolve();
			}

		});

	},

	initialize: function() {

		return new Promise(function(resolve, reject) {

			// Ensures SW is installed
			Worker.ready().then(function() {

				console.log('Hooking up communication channel...');
				Worker.channel.port1.onmessage = function(event) {

					// if the the response is simply a ping, saying the connection is established,
					// we're good to go to resolve the promise
					if(event.data === 'ping') {
						resolve();
					}

					// if the response comes with a promiseId instead, resolve the related
					// promise, posting it the 
					if(event.data.promiseId) {
						Worker.promises[event.data.promiseId](event.data.message);
					}

				};

				// send port 2 to service worker
				navigator.serviceWorker.controller.postMessage(Worker.clientId, [Worker.channel.port2]);

			}, reject);

		});

	},

	get: function() {

		return new Promise(function(resolve, reject) {

			console.log('retrieving endpoints from SW...');

			var promiseId = Date.now();
			Worker.promises[promiseId] = resolve;

			Worker.channel.port1.postMessage({ action: 'get', args: [Worker.clientId, promiseId] });

		});

	},

	add: function(route, endpoint) {

		return new Promise(function(resolve, reject) {

			console.log('adding endpoint to SW...');

			var promiseId = Date.now();
			Worker.promises[promiseId] = resolve;

			Worker.channel.port1.postMessage({ action: 'add', args: [Worker.clientId, promiseId, route, endpoint] });

		});

	},

	remove: function(route) {

		return new Promise(function(resolve, reject) {

			console.log('removing endpoint from SW...');

			var promiseId = Date.now();
			Worker.promises[promiseId] = resolve;

			Worker.channel.port1.postMessage({ action: 'remove', args: [Worker.clientId, promiseId, route] });

		});

	}

};

/*
 * Client
 */
var Client = {

	endpoints: null,

	setup: function() {

		add.addEventListener('click', function() {

			var endpoints = Client.endpoints;

			var route = Client.normalizeRoute(add_route.value);
			var jsonp = add_jsonp.checked;
			var retval = add_retval.value;

			if(endpoints[route]) {
				add_route.parentNode.classList.add('error-exists');
				return;
			} else {
				add_route.parentNode.classList.remove('error-exists');
			}

			try {
				JSON.parse(retval);
				add_retval.parentNode.classList.remove('error-badjson');
			} catch(e) {
				add_retval.parentNode.classList.add('error-badjson');
				return;
			}

			var endpoint = { jsonp: jsonp, response: retval };

			// store, then rerender
			Worker.add(route, endpoint).then(function() {
				console.log('WHY U FIRE');
				endpoints[route] = endpoint;
				Client.render();
			});

		}, false);

	},

	render: function() {

		var endpoints = Client.endpoints;
		var table = endpoints_table.children[0];
		var fragment = document.createDocumentFragment();
		console.log('rebuilding list of endpoints from ', endpoints);

		// clear table
		while(table.children.length > 1) {
			table.removeChild(table.children[table.children.length - 1]);
		}

		function remove() {

			var route = this.parentNode.__route;
			var endpoint = endpoints[route];

			Worker.remove(route).then(function() {

				delete endpoints[route];
				Client.render();

			});

		};

		function test() {

			var route = this.parentNode.__route;
			var endpoint = endpoints[route];

			console.log('Attempting XMLHttpRequest to ' + route + '...');

			var testRequest = new XMLHttpRequest();
			testRequest.onload = function() {
				if(this.status !== 200) {
					console.log('Request failed!');
				} else {
					console.log('Received the following output: ', this.responseText);
				}
				
			};
			testRequest.open('GET', route, true);
			testRequest.send();

		};

		// refill table
		var route, tr, td, button;
		for(route in endpoints) {
			tr = document.createElement('tr');

			td = document.createElement('td');
			td.innerHTML = route;
			tr.appendChild(td);

			td = document.createElement('td');
			td.innerHTML = endpoints[route].jsonp;
			tr.appendChild(td);

			td = document.createElement('td');
			td.innerHTML = endpoints[route].response;
			tr.appendChild(td);

			td = document.createElement('td');
			td.__route = route;
			tr.appendChild(td);

			// buttons
			button = document.createElement('button');
			button.innerHTML = 'Delete';
			button.onclick = remove;
			td.appendChild(button);

			button = document.createElement('button');
			button.innerHTML = 'Test (in console)';
			button.onclick = test;
			td.appendChild(button);

			fragment.appendChild(tr);
		}

		table.appendChild(fragment);

	},

	normalizeRoute: function(route) {

		if(route.substr(0,1) !== '/') {
			route = '/' + route;
		}

		if(route.substr(-1) === '/') {
			route = route.substr(0, route.length - 1);
		}

		return route;
	}

};

/*
 * Run
 */
Worker.initialize()
	.then(function() {
		return Worker.get();
	})
	.catch(function() {
		console.log('SO MUCH FAIL!');
	})
	.then(function(endpoints) {

		// SW is initialized, connection channel established, all endpoints received
		Client.endpoints = endpoints;

		// initialize the add form
		Client.setup();

		// populate list of endpoints
		Client.render();

});