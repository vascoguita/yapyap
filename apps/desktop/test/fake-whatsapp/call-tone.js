// Plays a steady tone while the call window is open, standing in for the other side's voice.
const context = new AudioContext();
const tone = context.createOscillator();
tone.frequency.value = 440;
tone.connect(context.destination);
tone.start();
