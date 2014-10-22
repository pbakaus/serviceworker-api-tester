API Tester (featuring Service Worker)
===================

API Tester allows you to setup **any number of static routes** (URLs) on the host it runs on, allowing you to **test a static JSON response**. This should be very useful when building prototypes or sample apps.

API Tester has been built in ~8 hours as part of an internal Service Worker hackathon, and is definitely not ready for production – but hey, you won't use it for production code anyway ;)

----------

How to use
-------------

> 1. Grab the code
> 2. Put it onto your localhost or upload it to your server
> 3. Open index.html in the browser
> 4. Start adding routes by defining the **route**, whether it should support **JSONP** (not implemented yet), and the **actual response** (has to be valid JSON)

That's it! Now say you added *foo/bar* as route and your running it on *http://localhost*, you can now query *http://localhost/foo/bar* from any site on your host and receive a valid JSON reponse. WOOHOO!
