"use strict"

const EventEmitter = require("events")
const http = require("http");
const WebSocketClient = require("websocket").client

class client extends EventEmitter {
	constructor(options) {
		super();

		this.options = options;
		this.log = options.log || function(message) {return message};

		this.client = new WebSocketClient();
		this.client.on("connect", this.connected.bind(this));
		this.client.on("connectFailed", this.connectFailed.bind(this));
	}

	restUrl() {
		return `http://${this.options.host}:${this.options.restPort}`;
	}

	wsUrl() {
		return `ws://${this.options.host}:${this.options.wsPort}/ws`;
	}

	connect() {
		this.client.connect(this.wsUrl());
		return this;
	}

	close() {
		this.ws.close();
		return this;
	}

	// GET via REST API
	get(url) {
		return new Promise((resolve, reject) => {
			let buffer = "";
			this.log(`GET ${this.restUrl()}${url}`);
			const request = http
				.get(`${this.restUrl()}${url}`, (res) => {
					if (res.statusCode !== 200) {
						this.log(`HTTP ${res.statusCode}`);
						reject(res.statusCode);
					} else {
						res.on("error", (err) => {
							reject(err);
						});
						res.on("data", (chunk) => {
							buffer += chunk;
						});
						res.on("end", () => {
							this.log(`${buffer.length} bytes`);
							try {
								const body = JSON.parse(buffer);
								resolve(body);
							} catch (error) {
								reject(error);
								this.log(error, error.stack);
								this.log(`[${buffer}]`);
							}
						});
					}
				});
			request.on("error", (err) => {
				reject(err);
			});
		});
	}

	// send via WebSocket
	send(message) {
		if (typeof message !== "object") {
			throw "send payload must be an object";
		}

		this.ws.sendUTF(JSON.stringify(message));
		return this;
	}

	connected(connection) {
		this.register(connection);
		this.emit("connected");
	}

	connectFailed(e) {
		this.emit("connectFailed", e);
	}

	register(connection) {
		this.ws = connection;
		this.ws.on("message", this.receive.bind(this));
		this.ws.on("close", () => {
			this.emit("close");
		});
		this.ws.on("error", (err) => {
			this.emit("error", err);
		});
	}

	receive(message) {
		this.emit("message", JSON.parse(message.utf8Data));
	}
}

module.exports = client;
