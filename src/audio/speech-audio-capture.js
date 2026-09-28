export class SpeechAudioCapture {
  constructor(onResult, onError) {
    this.onResult = onResult;
    this.onError = onError;
    this.audioContext = undefined;
    this.workletNode = undefined;
    this.mutedOutput = undefined;
    this.finishResolver = undefined;
    this.unsubscribeMessages = undefined;
    this.stopRequested = false;
  }

  async start(mediaStream) {
    if (this.audioContext) return;
    this.stopRequested = false;
    const audioTrack = mediaStream.getAudioTracks()[0];
    if (!audioTrack) throw new Error('No microphone audio track is available.');

    const recognizerStatus = await window.electronAPI.getSpeechRecognizerStatus();
    if (recognizerStatus.status !== 'ready') {
      throw new Error(recognizerStatus.error || 'Speech recognizer is still loading.');
    }
    this.unsubscribeMessages = window.electronAPI.onSpeechRecognitionMessage((message) => {
      if (message.type === 'result') this.onResult?.(message);
      if (message.type === 'error') this.onError?.(new Error(message.message));
      if (message.type === 'finished') this.finishResolver?.();
    });
    if (this.stopRequested) {
      this.unsubscribeMessages?.();
      this.unsubscribeMessages = undefined;
      return;
    }

    this.audioContext = new AudioContext();
    const source = this.audioContext.createMediaStreamSource(new MediaStream([audioTrack]));
    const workletUrl = new URL('audio/pcm-capture-processor.js', window.location.href).href;
    await this.audioContext.audioWorklet.addModule(workletUrl);
    if (this.stopRequested) {
      await this.stop();
      return;
    }
    this.workletNode = new AudioWorkletNode(this.audioContext, 'mirrospeak-pcm-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      channelCountMode: 'explicit',
      outputChannelCount: [1],
    });
    this.workletNode.port.onmessage = ({ data }) => {
      window.electronAPI.sendSpeechAudioFrame(data.samples);
    };
    this.mutedOutput = this.audioContext.createGain();
    this.mutedOutput.gain.value = 0;
    source.connect(this.workletNode);
    this.workletNode.connect(this.mutedOutput);
    this.mutedOutput.connect(this.audioContext.destination);
    await this.audioContext.resume();
  }

  async stop() {
    this.stopRequested = true;
    if (this.unsubscribeMessages) {
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 2000);
        this.finishResolver = () => {
          clearTimeout(timeout);
          resolve();
        };
        window.electronAPI.finishSpeechAudio();
      });
      this.finishResolver = undefined;
    }
    this.workletNode?.disconnect();
    this.mutedOutput?.disconnect();
    if (this.audioContext && this.audioContext.state !== 'closed') await this.audioContext.close();
    this.audioContext = undefined;
    this.workletNode = undefined;
    this.mutedOutput = undefined;
    this.unsubscribeMessages?.();
    this.unsubscribeMessages = undefined;
  }
}
