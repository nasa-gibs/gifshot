/*
  animatedGIF.js
  ==============
*/

/* Copyright  2017 Yahoo Inc.
 * Copyrights licensed under the MIT License. See the accompanying LICENSE file for terms.
*/

// Dependencies
import utils from './utils';
import frameWorkerCode from './processFrameWorker';
import NeuQuant from '../dependencies/NeuQuant';
import GifWriter from '../dependencies/gifWriter';

// Helpers
const noop = () => {};

const AnimatedGIF = function (options) {
    this.canvas = null;
    this.ctx = null;
    this.repeat = 0;
    this.frames = [];
    this.numRenderedFrames = 0;
    this.onRenderCompleteCallback = noop;
    this.onRenderProgressCallback = noop;
    this.workers = [];
    this.availableWorkers = [];
    this.generatingGIF = false;
    this.options = options;

    // Constructs and initializes the the web workers appropriately
    this.initializeWebWorkers(options);
};

AnimatedGIF.prototype = {
  'workerMethods': frameWorkerCode(),
  'initializeWebWorkers': function (options) {
      const self = this;
      const processFrameWorkerCode = NeuQuant.toString() + '(' + frameWorkerCode.toString() + '());';
      let webWorkerObj;
      let objectUrl;
      let webWorker;
      let numWorkers;
      let x = -1;
      let workerError = '';

      numWorkers = options.numWorkers;

      while (++x < numWorkers) {
          webWorkerObj = utils.createWebWorker(processFrameWorkerCode);

          if (utils.isObject(webWorkerObj)) {
              objectUrl = webWorkerObj.objectUrl;
              webWorker = webWorkerObj.worker;

              self.workers.push({
                  worker: webWorker,
                  objectUrl: objectUrl
              });

              self.availableWorkers.push(webWorker);
          } else {
              workerError = webWorkerObj;
              utils.webWorkerError = !!(webWorkerObj);
          }
      }

      this.workerError = workerError;
      this.canvas = document.createElement('canvas');
      this.canvas.width = options.gifWidth;
      this.canvas.height = options.gifHeight;
      this.ctx = this.canvas.getContext('2d');
      this.frames = [];
  },
  // Return a worker for processing a frame
  getWorker: function () {
      return this.availableWorkers.pop();
  },
  // Restores a worker to the pool
  freeWorker: function (worker) {
      this.availableWorkers.push(worker);
  },
  byteMap: (() => {
      let byteMap = [];

      for (let i = 0; i < 256; i++) {
          byteMap[i] = String.fromCharCode(i);
      }

      return byteMap;
  })(),
  bufferToString: function (buffer) {
      const numberValues = buffer.length;
      let str = '';
      let x = -1;

      while (++x < numberValues) {
          str += this.byteMap[buffer[x]];
      }

      return str;
  },
  onFrameFinished: function (progressCallback) {
      // The GIF is not written until we're done with all the frames
      // because they might not be processed in the same order
      const self = this;
      const frames = self.frames;
      const options = self.options;
      const hasExistingImages = !!(options.images || []).length;
      const allDone = frames.every((frame) => {
          return (
              !frame.beingProcessed &&
              frame.done
          );
      });

      self.numRenderedFrames++;

      if (hasExistingImages) {
          progressCallback(self.numRenderedFrames / frames.length);
      }

      self.onRenderProgressCallback(self.numRenderedFrames * 0.75 / frames.length);

      if (allDone) {
          if (!self.generatingGIF) {
              self.generateGIF(frames, self.onRenderCompleteCallback);
          }
      } else {
          utils.requestTimeout(function() {
              self.processNextFrame();
          }, 1);
      }
  },
  processFrame: function (position) {
      const AnimatedGifContext = this;
      const options = this.options;
      const {
          progressCallback,
          sampleInterval
      } = this.options;
      const frames = this.frames;
      let frame;
      let worker;
      const done = (ev = {}) => {
          const data = ev.data;

          // Delete original data, and free memory
          delete(frame.data);

          frame.pixels = Array.prototype.slice.call(data.pixels);
          frame.palette = Array.prototype.slice.call(data.palette);
          frame.done = true;
          frame.beingProcessed = false;

          AnimatedGifContext.freeWorker(worker);

          AnimatedGifContext.onFrameFinished(progressCallback);
      };

      frame = frames[position];

      if (frame.beingProcessed || frame.done) {
          this.onFrameFinished();

          return;
      }

      frame.sampleInterval = sampleInterval;
      frame.beingProcessed = true;
      frame.gifshot = true;

      worker = this.getWorker();

      if (worker) {
          // Process the frame in a web worker
          worker.onmessage = done;
          worker.postMessage(frame);
      } else {
          // Process the frame in the current thread
          done({
              'data': AnimatedGifContext.workerMethods.run(frame)
          });
      }
  },
  startRendering: function (completeCallback) {
      this.onRenderCompleteCallback = completeCallback;

      for (let i = 0; i < this.options.numWorkers && i < this.frames.length; i++) {
          this.processFrame(i);
      }
  },
  processNextFrame: function () {
      let position = -1;

      for (let i = 0; i < this.frames.length; i++) {
          const frame = this.frames[i];

          if (!frame.done && !frame.beingProcessed) {
              position = i;
              break;
          }
      }

      if (position >= 0) {
          this.processFrame (position);
      }
  },
  // Takes the already processed data in frames and feeds it to a new
  // GifWriter instance in order to get the binary GIF file
  generateGIF: function (frames, callback) {
      // TODO: Weird: using a simple JS array instead of a typed array,
      // the files are WAY smaller o_o. Patches/explanations welcome!
      let buffer = []; // new Uint8Array(width * height * frames.length * 5);
      let gifOptions = {
          loop: this.repeat
      };
      const options = this.options;
      const {
          interval
      } = options;
      const frameDuration = options.frameDuration;
      const existingImages = options.images;
      const hasExistingImages = !!(existingImages.length);
      const height = options.gifHeight;
      const width = options.gifWidth;
      const gifWriter = new GifWriter(buffer, width, height, gifOptions);
      const onRenderProgressCallback = this.onRenderProgressCallback;
      const delay = hasExistingImages ? interval * 100 : 0;
      let bufferToString;
      let gif;

      this.generatingGIF = true;

      utils.each(frames, (iterator, frame) => {
          const framePalette = frame.palette;
          const frameDelay = frame.delay;

          onRenderProgressCallback(0.75 + 0.25 * frame.position * 1.0 / frames.length);

          for (let i = 0; i < frameDuration; i ++) {
              gifWriter.addFrame(0, 0, width, height, frame.pixels, {
                  palette: framePalette,
                  delay: (frameDelay) ? (frameDelay * 0.1) + delay : delay
              });
          }
      });

      gifWriter.end();

      onRenderProgressCallback(1.0);

      this.frames = [];

      this.generatingGIF = false;

      if (utils.isFunction(callback)) {
          bufferToString = this.bufferToString(buffer);
          gif = 'data:image/gif;base64,' + utils.btoa(bufferToString);

          callback(gif);
      }
  },
  // From GIF: 0 = loop forever, null = not looping, n > 0 = loop n times and stop
  setRepeat: function (r) {
      this.repeat = r;
  },
  addFrame: function (element, gifshotOptions, frameText, frameDelay) {
      gifshotOptions = utils.isObject(gifshotOptions) ? gifshotOptions : {};

      const self = this;
      const ctx = self.ctx;
      const options = self.options;
      const width = options.gifWidth;
      const height = options.gifHeight;
      const fontSize = utils.getFontSize(gifshotOptions);
      const {
          filter,
          fontColor,
          fontFamily,
          fontWeight,
          gifHeight,
          gifWidth,
          text,
          textAlign,
          textBaseline,
          waterMark,
          waterMarkHeight,
          waterMarkWidth,
          waterMarkXCoordinate,
          waterMarkYCoordinate
      } = gifshotOptions;
      const textXCoordinate = gifshotOptions.textXCoordinate ? gifshotOptions.textXCoordinate : textAlign === 'left' ? 1 : textAlign === 'right' ? width : width / 2;
      const textYCoordinate = gifshotOptions.textYCoordinate ? gifshotOptions.textYCoordinate : textBaseline === 'top' ? 1 : textBaseline === 'center' ? height / 2 : height;
      const font = fontWeight + ' ' + fontSize + ' ' + fontFamily;
      const textToUse = (frameText && gifshotOptions.showFrameText) ? frameText : text;
      let imageData;

      try {
          ctx.filter = filter;

          ctx.drawImage(element, 0, 0, width, height);

          if (textToUse) {
              ctx.font = font;
              ctx.fillStyle = fontColor;
              ctx.textAlign = textAlign;
              ctx.textBaseline = textBaseline;
              ctx.fillText(textToUse, textXCoordinate, textYCoordinate);
          }
          if(waterMark) {
            ctx.drawImage(waterMark, waterMarkXCoordinate, waterMarkYCoordinate, waterMarkWidth, waterMarkHeight);
          }
          imageData = ctx.getImageData(0, 0, width, height);

          self.addFrameImageData(imageData, frameDelay);
      } catch (e) {
          return '' + e;
      }
  },
  addFrameImageData: function (imageData = {}, frameDelay) {
      const frames = this.frames;
      const imageDataArray = imageData.data;

      this.frames.push({
          'data': imageDataArray,
          'width': imageData.width,
          'height': imageData.height,
          'palette': null,
          'dithering': null,
          'done': false,
          'beingProcessed': false,
          'position': frames.length,
          'delay': frameDelay
      });
  },
  onRenderProgress: function (callback) {
      this.onRenderProgressCallback = callback;
  },
  isRendering: function () {
      return this.generatingGIF;
  },
  getBase64GIF: function (completeCallback) {
      const self = this;
      const onRenderComplete = (gif) => {
          self.destroyWorkers();

          utils.requestTimeout(() => {
              completeCallback(gif);
          }, 0);
      };

      self.startRendering(onRenderComplete);
  },
  destroyWorkers: function () {
      if (this.workerError) {
          return;
      }

      const workers = this.workers;

      // Explicitly ask web workers to die so they are explicitly GC'ed
      utils.each(workers, (iterator, workerObj) => {
          const worker = workerObj.worker;
          const objectUrl = workerObj.objectUrl;

          worker.terminate();
          utils.URL.revokeObjectURL(objectUrl);
      });
  }
};

export default AnimatedGIF;
