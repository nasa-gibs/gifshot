// existingImages.js
// =================

/* Copyright  2015 Yahoo Inc.
 * Copyrights licensed under the MIT License. See the accompanying LICENSE file for terms.
 */

define([
  'core/utils',
  'core/AnimatedGIF',
  'core/getBase64GIF',
  'core/error'
], function(utils, AnimatedGIF, getBase64GIF, error) {
  return function(obj) {
    var images = obj.images,
      imagesLength = obj.imagesLength,
      callback = obj.callback,
      options = obj.options,
      skipObj = {
        'getUserMedia': true,
        'window.URL': true
      },
      errorObj = error.validate(skipObj),
      loadedImages = [ ],
      loadedImagesLength = 0,
      tempImage,
      self = this,
      ag;
    if (errorObj.error) {
      return callback(errorObj);
    }
    // change workerPath to point to where Animated_GIF.worker.js is
    ag = new AnimatedGIF(options);

    utils.each(images, function(index, image) {
      var currentImage = image;
      if(image.src) {
        currentImage = currentImage.src;
      }
      if (utils.isElement(currentImage)) {
        if (options.crossOrigin) {
          currentImage.crossOrigin = options.crossOrigin;
        }
        loadedImages[index] = currentImage;
        loadedImagesLength += 1;
        
        if (loadedImagesLength === imagesLength) {
          addLoadedImagesToGif();
        }
      } else if (utils.isString(currentImage)) {
        tempImage = new Image();
        if (options.crossOrigin) {
          tempImage.crossOrigin = options.crossOrigin;
        }

        (function(tempImage) {
          if(image.text) {
              tempImage.text = image.text;
          }
          tempImage.onerror = function(e) {
            var error;
            --imagesLength; // skips over images that error out
            if(imagesLength === 0) {
              error = {};
              error.error = 'None of the requested images was capable of being retrieved';
              return callback(error);
            }
            if (loadedImagesLength === imagesLength) {
              if(obj.options.pause) {
                addPauseFrames(obj.options);
              }
              addLoadedImagesToGif();
            }
          };
          tempImage.onload = function(e) {
            if(image.text) {
              loadedImages[index] = {img:tempImage, text: tempImage.text};
            } else {
              loadedImages[index] = tempImage;
            }
            loadedImagesLength += 1;
            if (loadedImagesLength === imagesLength) {
              if(obj.options.pause) {
                addPauseFrames(obj.options);
              }
              addLoadedImagesToGif();
            }
            utils.removeElement(tempImage);
          };
          tempImage.src = currentImage;
        }(tempImage));

        utils.setCSSAttr(tempImage, {
          'position': 'fixed',
          'opacity': '0'
        });

        document.body.appendChild(tempImage);
      }
    });
    function addPauseFrames(options) {
      var speed = 1 / options.interval;
      var len = speed * options.pause;
      var lastImage = loadedImages[loadedImages.length - 1];
      for(var i = 0;
        i < len; i++) {
        loadedImages.push(lastImage);
      }

    }
    function addLoadedImagesToGif () {
      utils.each(loadedImages, function(index, loadedImage) {
        if (loadedImage) {
          if(loadedImage.text) {
            ag.addFrame(loadedImage.img, options, loadedImage.text);
          } else {
            ag.addFrame(loadedImage, options);
          }
        }
      });
      getBase64GIF(ag, callback);
    }
  };
});
