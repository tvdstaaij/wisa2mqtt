'use strict';

const assert = require('assert');
const Mqtt = require('async-mqtt');
const {EventEmitter} = require('events');

class MqttBridge extends EventEmitter {
  constructor(name, uri) {
    super();
    this._name = name;
    this._uri = uri;
    this._client = null;
  }

  async start() {
    this._client = await Mqtt.connectAsync(this._uri, {
      clientId: `wisa2mqtt_${Math.random().toString(16).substr(2, 8)}`,
      will: {
        topic: 'wisa2mqtt/status/alive',
        payload: 'false',
        retain: true,
      },
      keepalive: 10,
    });
    console.log(`Connected to MQTT broker ${this._name}`);
    this.emit('connected');
    this._client.on('message', (...args) => this._handleMessage(...args));
    this._client.on('connect', () => {
      console.log(`Reconnected to MQTT broker ${this._name}`);
      this.emit('connected');
    });
    this._client.on('offline', () => {
      console.log(`Disconnected from MQTT broker ${this._name}`);
      this.emit('disconnected');
    });
    await this._client.subscribe('wisa2mqtt/command/+');
  }

  async publishStatus(key, value) {
    if (!this._client) return;
    await this._client.publish(`wisa2mqtt/status/${key}`, String(value), {retain: true});
  }

  _handleMessage(topic, msg) {
    const fragments = topic.split('/');
    if (fragments[1] !== 'command') return;
    if (msg instanceof Buffer) {
      msg = msg.toString('utf8');
    }
    assert.ok(typeof msg === 'string');
    let eventData = {command: fragments[2], arg: msg};
    console.log(`Received command through broker ${this._name}:`, eventData);
    this.emit('commandReceived', eventData);
  }
}

module.exports = MqttBridge;
