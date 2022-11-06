'use strict';

const assert = require('assert');
const {EventEmitter} = require('events');

const SERIAL_SERVICE_UUID = '97ded94c-b564-48ab-ba96-7e1d2daa0edd';
const SERIAL_CHARACTERISTIC_UUID = 'a4a8d442-b8d0-404c-a0fb-f120115acf5e'

const MSG_TYPE = {
  READ: 0,
  WRITE: 1,
  RESPONSE: 2,
};
const DATA_FIELD = {
  VOLUME: 4,
  AUDIO_SOURCE: 5,
  AUDIO_MODE: 9,
  AUDIO_FORMAT: 54,
};
const AUDIO_MODE_MAP = ['direct', 'movie', 'music', 'night'];
const AUDIO_SOURCE_MAP = ['arc', 'optical'];

class SoundSend extends EventEmitter {
  constructor(adapter, deviceAddress) {
    super();
    this.connected = false;
    this._adapter = adapter;
    this._deviceAddress = deviceAddress;
    this._device = null;
    this._serialCharacteristic = null;
    this._rxBuf = Buffer.from([]);
    this._audioFormat = null;
  }

  async start() {
    await this._tryConnect();
  }

  async setAudioSource(sourceString) {
    const sourceId = AUDIO_SOURCE_MAP.indexOf(sourceString.toLowerCase());
    assert.ok(sourceId >= 0);
    return this._sendCommand(MSG_TYPE.WRITE, DATA_FIELD.AUDIO_SOURCE, [sourceId]);
  }

  async setVolume(volumePercentage) {
    volumePercentage = Number(volumePercentage);
    assert.ok(volumePercentage === Math.round(volumePercentage));
    assert.ok(volumePercentage >= 0 && volumePercentage <= 100);
    return this._sendCommand(MSG_TYPE.WRITE, DATA_FIELD.VOLUME, [volumePercentage]);
  }

  async setAudioMode(modeString) {
    const modeId = AUDIO_MODE_MAP.indexOf(modeString.toLowerCase());
    assert.ok(modeId >= 0);
    return this._sendCommand(MSG_TYPE.WRITE, DATA_FIELD.AUDIO_MODE, [modeId]);
  }

  async _sendCommand(msgType, dataField, value = []) {
    if (this.connected) {
      const header = [msgType, dataField, value.length];
      const buf = Buffer.from(header.concat(value));
      const options = {type: 'command'};
      return this._serialCharacteristic.writeValue(buf, options);
    }
  }

  _processRxData(buf) {
    this._rxBuf = Buffer.concat([this._rxBuf, buf]);
    while (this._rxBuf.length >= 3) {
      const [msgType, dataField, valueLen] = this._rxBuf;
      const msgLen = valueLen + 3;
      const value = this._rxBuf.subarray(3, msgLen);
      if (msgType == MSG_TYPE.RESPONSE) {
        this._processResponse(dataField, value);
      } else {
        console.log(`Unknown message type ${msgType} (field=${dataField} len=${valueLen} value=${value})`);
      }
      this._rxBuf = Uint8Array.prototype.slice.call(this._rxBuf, msgLen);
    }
  }

  _processResponse(dataField, value) {
    switch (dataField) {
      case DATA_FIELD.VOLUME:
        this.emit('propertyChanged', {key: 'volume', value: value[0]});
        break;
      case DATA_FIELD.AUDIO_MODE:
        this.emit('propertyChanged', {key: 'audioMode', value: AUDIO_MODE_MAP[value[0]]});
        break;
      case DATA_FIELD.AUDIO_SOURCE:
        this.emit('propertyChanged', {key: 'audioSource', value: AUDIO_SOURCE_MAP[value[0]]});
        break;
      case DATA_FIELD.AUDIO_FORMAT:
        if (value.length < 3) break;
        const formatString = value.subarray(2).toString('utf8');
        if (this._audioFormat !== formatString) {
          this._audioFormat = formatString;
          this.emit('propertyChanged', {key: 'audioFormat', value: formatString});
        }
        break;
      default:
        console.log(`Unknown response for data field ${dataField} (value=${value})`);
    }
  }

  async _readSettings() {
    await this._sendCommand(MSG_TYPE.READ, DATA_FIELD.VOLUME);
    await this._sendCommand(MSG_TYPE.READ, DATA_FIELD.AUDIO_MODE);
    await this._sendCommand(MSG_TYPE.READ, DATA_FIELD.AUDIO_SOURCE);
  }

  async _tryConnect() {
    try {
      console.log('Connecting to SoundSend');
      const isDiscovering = await this._adapter.isDiscovering();
      if (!isDiscovering) {
        await this._adapter.startDiscovery();
      }
      this._device = await this._adapter.waitDevice(this._deviceAddress);

      this._device.once('disconnect', () => {
        console.log('Disconnected from SoundSend');
        this._device = null;
        this._serialCharacteristic = null;
        if (this.connected) {
            this.connected = false;
            this.emit('disconnected');
        }
        this._tryConnect();
      });

      await this._device.connect();
      const gattServer = await this._device.gatt();
      const serialService = await gattServer.getPrimaryService(SERIAL_SERVICE_UUID);
      this._serialCharacteristic = await serialService.getCharacteristic(SERIAL_CHARACTERISTIC_UUID);
      this._serialCharacteristic.on('valuechanged', (buf) => this._processRxData(buf));
      await this._serialCharacteristic.startNotifications();
      if (this._device) {
        console.log('Connected to SoundSend');
        this.connected = true;
        this.emit('connected');
        this._readSettings();
      }
    } catch (e) {
      if (e && e.type && e.type == 'org.bluez.Error.Failed') {
        console.log(`Failed to connect to SoundSend (${e.text})`);
      } else {
        console.log('Unexpected BLE connection error:', e);
      }
      setTimeout(() => this._tryConnect(), 5000);
    }
  }
}

module.exports = SoundSend;
