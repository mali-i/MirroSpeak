class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.phase = 0;
    this.sum = 0;
    this.count = 0;
    this.output = new Float32Array(1600);
    this.outputLength = 0;
  }

  process(inputs) {
    const channels = inputs[0];
    if (!channels || channels.length === 0) return true;

    const frames = channels[0].length;
    for (let i = 0; i < frames; i += 1) {
      let sample = 0;
      for (let channel = 0; channel < channels.length; channel += 1) sample += channels[channel][i];
      sample /= channels.length;
      this.sum += sample;
      this.count += 1;
      this.phase += 16000;

      if (this.phase >= sampleRate) {
        this.phase -= sampleRate;
        this.output[this.outputLength++] = this.sum / this.count;
        this.sum = 0;
        this.count = 0;
      }

      if (this.outputLength === this.output.length) {
        const samples = this.output;
        this.port.postMessage({ samples, sampleRate: 16000 }, [samples.buffer]);
        this.output = new Float32Array(1600);
        this.outputLength = 0;
      }
    }
    return true;
  }
}

registerProcessor('mirrospeak-pcm-capture', PcmCaptureProcessor);
