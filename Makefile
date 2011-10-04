all: client

client: websocket/client/connection.js

websocket/client/connection.js: websocket/client/sockjs.js websocket/client/conn.js websocket/client/context.js
	cat $^ >$@

.PHONY: all client
