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
    this._conn_attempts = 0;
    this.connected = false;
    this._adapter = adapter;
    this._deviceAddress = deviceAddress;
    this._device = null;
    this._serialCharacteristic = null;
    this._rxBuf = Buffer.from([]);
    this._audioFormat = null;
    this._audioMode = null;
    this._audioSource = null;
    this._volume = null;
    this._muted = false;
  }

  async start() {
    await this._tryConnect();
  }

  async setVolume(volumePercentage) {
    volumePercentage = Number(volumePercentage);
    assert.ok(volumePercentage === Math.round(volumePercentage));
    assert.ok(volumePercentage >= 0 && volumePercentage <= 100);
    this._volume = volumePercentage;
    const effectiveVolume = this._muted ? 0 : this._volume;
    return this._sendCommand(MSG_TYPE.WRITE, DATA_FIELD.VOLUME, [effectiveVolume]);
  }

  async adjustVolume(relativeVolumePercentage) {
    relativeVolumePercentage = Number(relativeVolumePercentage);
    assert.ok(this._volume !== null);
    assert.ok(relativeVolumePercentage === Math.round(relativeVolumePercentage));
    let newVolume = this._volume + relativeVolumePercentage;
    if (newVolume < 0) newVolume = 0;
    if (newVolume > 100) newVolume = 100;
    return this.setVolume(newVolume);
  }

  async setMute(muted) {
    assert.ok(this._volume !== null);
    this._muted = Boolean(muted);
    return this.setVolume(this._volume);
  }

  async toggleMute() {
    return this.setMute(!this._muted);
  }

  async setAudioMode(mode) {
    const mappedModeId = AUDIO_MODE_MAP.indexOf(String(mode).toLowerCase());
    const modeId = mappedModeId >= 0 ? mappedModeId : Number(mode);
    assert.ok(modeId === Math.round(modeId));
    assert.ok(modeId >= 0);
    assert.ok(modeId < AUDIO_MODE_MAP.length);
    this._audioMode = modeId;
    return this._sendCommand(MSG_TYPE.WRITE, DATA_FIELD.AUDIO_MODE, [modeId]);
  }

  async cycleAudioMode() {
    assert.ok(this._audioMode !== null);
    const nextAudioMode = (this._audioMode + 1) % AUDIO_MODE_MAP.length;
    return this.setAudioMode(nextAudioMode);
  }

  async setAudioSource(source) {
    const mappedSourceId = AUDIO_SOURCE_MAP.indexOf(String(source).toLowerCase());
    const sourceId = mappedSourceId >= 0 ? mappedSourceId : Number(source);
    assert.ok(sourceId === Math.round(sourceId));
    assert.ok(sourceId >= 0);
    assert.ok(sourceId < AUDIO_SOURCE_MAP.length);
    this._audioSource = sourceId;
    return this._sendCommand(MSG_TYPE.WRITE, DATA_FIELD.AUDIO_SOURCE, [sourceId]);
  }

  async cycleAudioSource() {
    assert.ok(this._audioSource !== null);
    const nextAudioSource = (this._audioSource + 1) % AUDIO_SOURCE_MAP.length;
    return this.setAudioSource(nextAudioSource);
  }

  async queryAudioFormat() {
    await this._sendCommand(MSG_TYPE.READ, DATA_FIELD.AUDIO_FORMAT);
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
        if (this._volume === null) {
          this._volume = value[0];
        }
        this.emit('propertyChanged', {key: 'volume', value: value[0]});
        break;
      case DATA_FIELD.AUDIO_MODE:
        if (this._audioMode === null) {
          this._audioMode = value[0];
        }
        this.emit('propertyChanged', {key: 'audioMode', value: AUDIO_MODE_MAP[value[0]]});
        break;
      case DATA_FIELD.AUDIO_SOURCE:
        if (this._audioSource === null) {
          this._audioSource = value[0];
        }
        this.emit('propertyChanged', {key: 'audioSource', value: AUDIO_SOURCE_MAP[value[0]]});
        break;
      case DATA_FIELD.AUDIO_FORMAT:
        if (value.length < 2) break;
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
      this.emit('connecting', {attempt: ++this._conn_attempts});
      console.log(`Connecting to SoundSend (attempt ${this._conn_attempts})`);
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
        this._conn_attempts = 0;
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
