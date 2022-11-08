'use strict';

const assert = require('assert');
const Mqtt = require('async-mqtt');
const {EventEmitter} = require('events');

class MqttBridge extends EventEmitter {
  constructor(uri) {
    super();
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
    });
    console.log('Connected to MQTT broker');
    this._client.on('message', (...args) => this._handleMessage(...args));
    this._client.on('connect', () => console.log('Reconnected to MQTT broker'));
    this._client.on('offline', () => console.log('Disconnected from MQTT broker'));
    await this._client.subscribe('wisa2mqtt/command/+');
  }

  async publishStatus(key, value) {
    await this._client.publish(`wisa2mqtt/status/${key}`, String(value), {retain: true});
  }

  _handleMessage(topic, msg) {
    const fragments = topic.split('/');
    if (fragments[1] !== 'command') return;
    if (msg instanceof Buffer) {
      msg = msg.toString('utf8');
    }
    assert.ok(typeof msg === 'string');
    this.emit('commandReceived', {command: fragments[2], arg: msg});
  }
}

module.exports = MqttBridge;
