/*
  existingImages.js
  =================
*/

/* Copyright  2017 Yahoo Inc.
 * Copyrights licensed under the MIT License. See the accompanying LICENSE file for terms.
*/

import utils from './utils';
import AnimatedGIF from './AnimatedGIF';
import getBase64GIF from './getBase64GIF';
import error from './error';

export default function existingImages (obj = {}) {
    const self = this;
    const {
        callback,
        images,
        options
    } = obj;
    let imagesLength = obj.imagesLength;
    const skipObj = {
        'getUserMedia': true,
        'window.URL': true
    };
    const errorObj = error.validate(skipObj);
    let loadedImages = [];
    let loadedImagesLength = 0;
    let tempImage;
    let ag;

    if (errorObj.error) {
        return callback(errorObj);
    }

    // change workerPath to point to where Animated_GIF.worker.js is
    ag = new AnimatedGIF(options);

    utils.each(images, function (index, image) {
        let currentImage = image;

        if (image.src) {
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

            (function (tempImage) {
                tempImage.onerror = function (e) {
                    let obj;

                    --imagesLength; // skips over images that error out

                    if (imagesLength === 0) {
                        obj = {};
                        obj.error = 'None of the requested images was capable of being retrieved';

                        return callback(obj);
                    }
                };

                tempImage.onload = function (e) {
                    if(image.text || image.delay) {
                        loadedImages[index] = {
                            img:tempImage,
                            text: image.text,
                            delay: image.delay
                        };
                    } else {
                        loadedImages[index] = tempImage;
                    }

                    loadedImagesLength += 1;

                    if (loadedImagesLength === imagesLength) {
                        addLoadedImagesToGif();
                    }

                    utils.removeElement(tempImage);
                };

                tempImage.src = currentImage;
            }(tempImage));

            utils.setCSSAttr(tempImage, {
                position: 'fixed',
                opacity: '0'
            });

            document.body.appendChild(tempImage);
        }
    });

    function addLoadedImagesToGif () {
        utils.each(loadedImages, function (index, loadedImage) {
            if (loadedImage) {
                if(loadedImage.text || loadedImage.delay) {
                    ag.addFrame(loadedImage.img, options, loadedImage.text, loadedImage.delay);
                } else {
                    ag.addFrame(loadedImage, options);
                }
            }
        });

        getBase64GIF(ag, callback);
    }
};
