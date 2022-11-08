'use strict';

async function handleCommand(soundSend, command, arg) {
  console.log('Received command:', {command, arg});
  try {
    switch (command) {
      case 'setsource':
        await soundSend.setAudioSource(arg);
        break;
      case 'nextsource':
        await soundSend.cycleAudioSource();
        break;
      case 'setvolume':
        await soundSend.setVolume(arg);
        break;
      case 'volumeup':
        await soundSend.adjustVolume(arg);
        break;
      case 'volumedown':
        await soundSend.adjustVolume(-arg);
        break;
      case 'setaudiomode':
        await soundSend.setAudioMode(arg);
        break;
      case 'nextaudiomode':
        await soundSend.cycleAudioMode();
        break;
      case 'mute':
        await soundSend.setMute(true);
        break;
      case 'unmute':
        await soundSend.setMute(false);
        break;
      case 'togglemute':
        await soundSend.toggleMute();
        break;
      case 'getaudioformat':
        await soundSend.queryAudioFormat();
        break;
      default:
        throw new Error('Unknown command');
    }
  } catch (err) {
    console.log('Failed to handle command:', err);
  }
}

module.exports = handleCommand;
