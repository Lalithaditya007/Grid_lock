// ml.worker.js — Brain.js training runs off the main thread
// Receives: { trainingData, hiddenLayers, iterations, errorThresh }
// Posts back: { type:'progress', pct } | { type:'done', weights }

self.onmessage = async function(e) {
  const { trainingData, hiddenLayers, iterations, errorThresh } = e.data;

  // Dynamically import brain.js inside the worker
  const { NeuralNetwork } = await import('brain.js');

  const net = new NeuralNetwork({
    hiddenLayers,
    activation: 'sigmoid',
    learningRate: 0.01,
  });

  net.train(trainingData, {
    iterations,
    errorThresh,
    log: true,
    logPeriod: 100,
    callback: ({ iterations: iter, error }) => {
      self.postMessage({
        type: 'progress',
        pct: Math.round((iter / iterations) * 100),
        error: error.toFixed(5),
      });
    },
    callbackPeriod: 100,
  });

  // Serialize the trained network
  self.postMessage({ type: 'done', json: net.toJSON() });
};
