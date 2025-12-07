'use strict';

const assert = require('assert');
const {EventEmitter} = require('events');
const { mapEqGainToByte, mapByteToEqGain } = require('./utils.js');

const SERIAL_SERVICE_UUID = '97ded94c-b564-48ab-ba96-7e1d2daa0edd';
const SERIAL_CHARACTERISTIC_UUID = 'a4a8d442-b8d0-404c-a0fb-f120115acf5e';

const MSG_TYPE = {
  READ: 0,
  WRITE: 1,
  RESPONSE: 2,
};
const DATA_FIELD = {
  VOLUME: 4,
  AUDIO_SOURCE: 5,
  POWER: 6,
  AUDIO_MODE: 9,
  AUDIO_FORMAT: 54,
  BASS_MANAGEMENT: 56,
  EQ_HIGH: 33,
  EQ_MIDRANGE: 34,
  EQ_VOICE: 35,
  EQ_MIDBASS: 36,
  EQ_SUBBASS: 37
};
const AUDIO_MODE_MAP = ['direct', 'movie', 'music', 'night'];
const AUDIO_SOURCE_MAP = ['arc', 'optical'];
const AUDIO_FORMAT_MAP = {
  'no signal':        'No Signal',
  'multi-ch pcm':     'PCM Multi-Ch',
  'pcm 2/0':          "PCM 2/0",
  'dolby digital':    'Dolby AC-3',
  'dolby digital p':  'Enhanced AC-3',
  'dolby truehd':     'True HD',
  'dolby atmos (do':  'Atmos',
  '(pcm 2/0)':        "Dolby Sorround (PCM 2/0)",
  'dolby surro':      'Dolby Sorround (PCM 2/0)',
  '(pcm 5/1)':        "Dolby Sorround (PCM 5/1)",
  '(dolby digital ':   'Enhanced AC-3',
  '(Dolby Digital)':   'Dolby AC-3'

};

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
    this._power = null;
    this._bass_management = null;
    this._eq_high = null;
    this._eq_midrange = null;
    this._eq_voice = null;
    this._eq_midbass = null;
    this._eq_subbass = null;
  }

  async start() {
    await this._tryConnect();
  }

async setEqHigh(gain) {
    const gain_value = mapEqGainToByte(gain);
    const dataField = DATA_FIELD.EQ_HIGH;
    this._eq_high = gain;
    this.emit('propertyChanged', {key: 'eq_high', 'value': this._eq_high});
    return this._sendCommand(MSG_TYPE.WRITE, dataField, [gain_value]);
  }
  async setEqVoice(gain) {
    const gain_value = mapEqGainToByte(Number(gain));
    this._eq_voice = gain;
    this.emit('propertyChanged', {key: 'eq_voice', 'value': this._eq_voice});
    const dataField = DATA_FIELD.EQ_VOICE;
    return this._sendCommand(MSG_TYPE.WRITE, dataField, [gain_value]);
  }

  async setEqMidrange(gain) {
    const gain_value = mapEqGainToByte(Number(gain));
    this._eq_midrange = gain;

    this.emit('propertyChanged', {key: 'eq_midrange', 'value': this._eq_midrange});
    const dataField = DATA_FIELD.EQ_MIDRANGE;
    return this._sendCommand(MSG_TYPE.WRITE, dataField, [gain_value]);
  }

  async setEqMidbass(gain) {
    gain = Number(gain);
    const gain_value = mapEqGainToByte(Number(gain));
    this._eq_midbass = gain;
    this.emit('propertyChanged', {key: 'eq_midbass', 'value': this._eq_midbass});
    const dataField = DATA_FIELD.EQ_MIDBASS;
    return this._sendCommand(MSG_TYPE.WRITE, dataField, [gain_value]);
  }

  async setEqSubbass(gain) {
    const gain_value = mapEqGainToByte(Number(gain));
    this._eq_subbass = gain;
    this.emit('propertyChanged', {key: 'eq_subbass', 'value': this._eq_subbass});
    const dataField = DATA_FIELD.EQ_SUBBASS;
    return this._sendCommand(MSG_TYPE.WRITE, dataField, [gain_value]);
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
    assert.ok(relativeVolumePercentage === Math.round(relativeVolumePercentage));
    if (this._volume !== null) {
      let newVolume = this._volume + relativeVolumePercentage;
      if (newVolume < 0) newVolume = 0;
      if (newVolume > 100) newVolume = 100;
      return this.setVolume(newVolume);
    }
  }

  async setMute(muted) {
    if (this._volume !== null) {
      this._muted = Boolean(muted);
      return this.setVolume(this._volume);
    }
  }

  async toggleMute() {
    return this.setMute(!this._muted);
  }

  async setPower(enabled) {
    this._power = enabled;
    return this._sendCommand(MSG_TYPE.WRITE, DATA_FIELD.POWER, [Number(enabled)]);
  }

  async togglePower() {
    if (this._power !== null) {
      return this.setPower(!this._power);
    }
  }

  async setBassManagement(enabled) {
    this._bass_management = enabled;
    return this._sendCommand(MSG_TYPE.WRITE, DATA_FIELD.BASS_MANAGEMENT, [Number(enabled)]);
  }

  async toggleBassManagement() {
    if (this._bass_management !== null) {
      return this.setBassManagement(!this._bass_management);
    }
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
    if (this._audioMode !== null) {
      const nextAudioMode = (this._audioMode + 1) % AUDIO_MODE_MAP.length;
      return this.setAudioMode(nextAudioMode);
    }
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
    if (this._audioSource !== null) {
      const nextAudioSource = (this._audioSource + 1) % AUDIO_SOURCE_MAP.length;
      return this.setAudioSource(nextAudioSource);
    }
  }

  async queryAudioFormat() {
    await this._sendCommand(MSG_TYPE.READ, DATA_FIELD.AUDIO_FORMAT);
  }

  async readSettings() {
    await this._sendCommand(MSG_TYPE.READ, DATA_FIELD.VOLUME);
    await this._sendCommand(MSG_TYPE.READ, DATA_FIELD.AUDIO_MODE);
    await this._sendCommand(MSG_TYPE.READ, DATA_FIELD.AUDIO_SOURCE);
    await this._sendCommand(MSG_TYPE.READ, DATA_FIELD.POWER);
    await this._sendCommand(MSG_TYPE.READ, DATA_FIELD.BASS_MANAGEMENT);
    await this._sendCommand(MSG_TYPE.READ, DATA_FIELD.EQ_SUBBASS);
    await this._sendCommand(MSG_TYPE.READ, DATA_FIELD.EQ_MIDBASS);
    await this._sendCommand(MSG_TYPE.READ, DATA_FIELD.EQ_MIDRANGE);
    await this._sendCommand(MSG_TYPE.READ, DATA_FIELD.EQ_VOICE);
    await this._sendCommand(MSG_TYPE.READ, DATA_FIELD.EQ_HIGH);
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
      case DATA_FIELD.POWER:
        if (this._power === null) {
          this._power = Boolean(value[0]);
        }
        this.emit('propertyChanged', {key: 'power', value: Boolean(value[0])});
        break;
      case DATA_FIELD.BASS_MANAGEMENT:
        if (this._bass_management === null) {
          this._bass_management = Boolean(value[0]);
        }
        this.emit('propertyChanged', {key: 'bassManagement', value: Boolean(value[0])});
        break;
      case DATA_FIELD.AUDIO_FORMAT:
        if (value.length < 2) break;
        const rawFormat = value.subarray(2).toString('utf8');
        // It seems the SoundSend transmits this in chunks of 15 bytes/characters.
        // Since the first 15 chars are sufficient to identify the format,
        // simply trim to 15 and ignore everything that is not recognized.
        const trimmedFormat = rawFormat.substring(0, 15);
        const mappedFormat = AUDIO_FORMAT_MAP[trimmedFormat.toLowerCase()];
        if (mappedFormat && this._audioFormat !== mappedFormat) {
          this._audioFormat = mappedFormat;
          this.emit('propertyChanged', {key: 'audioFormat', value: mappedFormat});
        }
        break;
      case DATA_FIELD.EQ_HIGH:
            if (this._eq_high === null) {
              this._eq_high = mapByteToEqGain(value[0])
              console.log('EQ_HIGH value:', value[0], mapByteToEqGain(value[0]));
            }
            this.emit('propertyChanged', {key: 'eq_high', 'value': this._eq_high});
          break;
      case DATA_FIELD.EQ_MIDRANGE:
            if (this._eq_midrange === null) {
              this._eq_midrange = mapByteToEqGain(value[0])
              console.log('EQ_MIDRANGE value:', value[0], mapByteToEqGain(value[0]));
            }
            this.emit('propertyChanged', {key: 'eq_midrange', 'value': this._eq_midrange});
          break;
    
      case DATA_FIELD.EQ_VOICE:
            if (this._eq_voice === null) {
              this._eq_voice = value[0]
              console.log('EQ_VOICE value:', value[1], value[0]);
            }
            this.emit('propertyChanged', {key: 'eq_voice', 'value': this._eq_voice});
          break;
      case DATA_FIELD.EQ_MIDBASS:
            if (this._eq_midbass === null) {
              this._eq_midbass = mapByteToEqGain(value[0])
            }
            console.log('EQ_MIDBASS value:', value[0], mapByteToEqGain(value[0]));
            this.emit('propertyChanged', {key: 'eq_midbass', 'value': this._eq_midbass});
          break;

      case DATA_FIELD.EQ_SUBBASS:
            if (this._eq_subbass === null) {
              this._eq_subbass = mapByteToEqGain(value[0])
            }
             console.log('EQ_SUBBASS value:', value[0], mapByteToEqGain(value[0]));
            this.emit('propertyChanged', {key: 'eq_subbass', 'value': this._eq_subbass});
          break;
      default:
        console.log(`Unknown response for data field ${dataField} (value=${value})`);
    }
  }

  async _tryConnect() {
    try {
      this.emit('connecting', {attempt: ++this._conn_attempts});
      console.log(`Connecting to SoundSend ${this._deviceAddress} (attempt ${this._conn_attempts})`);
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
        this.readSettings();
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
