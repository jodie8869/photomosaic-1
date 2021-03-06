import nj from 'numjs';
import tileArray from 'ndarray-tile';
import ops from 'ndarray-ops';
import { resize, computeDataURL } from './image';
import { boundAtSmallerDimension } from './utils';

export function cropMainImageToSquare({
  buffer,
  width,
  height,
  crop,
}) {
  const x = ((crop.x / 100) * width) | 0;
  const y = ((crop.y / 100) * height) | 0;

  let newWidth = ((crop.width / 100) * width) | 0;
  let newHeight = ((crop.height / 100) * height) | 0;

  // Make square
  if (newWidth > newHeight) {
    newWidth = newHeight;
  } else if (newHeight > newWidth) {
    newHeight = newWidth;
  }

  const croppedArray = nj
    .uint8(buffer)
    .reshape(height, width, 4)
    .slice([y, y + newHeight], [x, x + newWidth])
    .flatten()
    .tolist();

  return {
    buffer: new Uint8Array(croppedArray),
    width: newWidth,
    height: newHeight,
  };
}

export function cropAndResizeMainImageToSquare({
  buffer,
  width,
  height,
  tileComparisonDimension,
  crop,
  maxSize,
}) {
  const croppedMainImage = cropMainImageToSquare({
    buffer,
    width,
    height,
    crop,
  });

  const {
    width: newWidth,
    height: newHeight,
  } = boundAtSmallerDimension({
    width: croppedMainImage.width,
    height: croppedMainImage.height,
    maxWidth: maxSize,
    maxHeight: maxSize,
  });

  const finalWidth = newWidth - (newWidth % tileComparisonDimension);
  const finalHeight = newHeight - (newHeight % tileComparisonDimension);

  const resizedBuffer = resize(croppedMainImage.buffer, {
    width: croppedMainImage.width,
    height: croppedMainImage.height,
    newWidth: finalWidth,
    newHeight: finalHeight,
  });

  return {
    buffer: resizedBuffer,
    width: finalWidth,
    height: finalHeight,
  };
}

export function getMainImageForPhotomosaic(options) {
  return cropAndResizeMainImageToSquare(options);
}

export function computeDiff({
  mainImageWidth,
  mainImageHeight,
  tileDimension,
  tileComparisonDimension,
  tileOutputDimension,
  mainImageBuffer,
  tileBuffer,
}) {
  const comparisonTileBuffer = resize(tileBuffer, {
    width: tileDimension,
    height: tileDimension,
    newWidth: tileComparisonDimension,
    newHeight: tileComparisonDimension,
  });

  let outputTileBuffer;

  if (tileOutputDimension === tileDimension) {
    outputTileBuffer = tileBuffer;
  } else {
    outputTileBuffer = resize(tileBuffer, {
      width: tileDimension,
      height: tileDimension,
      newWidth: tileOutputDimension,
      newHeight: tileOutputDimension,
    });
  }

  const heightScale = (mainImageHeight / tileComparisonDimension) | 0;
  const widthScale = (mainImageWidth / tileComparisonDimension) | 0;

  const mainImage = nj
    .float32(mainImageBuffer)
    .reshape(mainImageHeight, mainImageWidth, 4);

  const selection = tileArray(
    nj.ndarray(
      comparisonTileBuffer,
      [tileComparisonDimension, tileComparisonDimension, 4]
    ),

    [heightScale, widthScale]
  );

  const tile = new nj.NdArray(selection);
  const diff = nj.power(mainImage.subtract(tile), 2);
  const diffReduced = nj.zeros([heightScale, widthScale], 'float32');

  for (let i = 0; i < mainImageHeight; i += tileComparisonDimension) {
    for (let j = 0; j < mainImageWidth; j += tileComparisonDimension) {
      const sum = diff.slice(
        [i, i + tileComparisonDimension],
        [j, j + tileComparisonDimension]
      ).sum();

      const sumSqrt = Math.sqrt(sum);

      diffReduced.set(
        i / tileComparisonDimension,
        j / tileComparisonDimension,
        sumSqrt
      );
    }
  }

  return {
    tileBuffer: outputTileBuffer,
    diffBuffer: diffReduced.selection.data,
  };
}

export async function computePhotomosaic({
  width,
  height,
  tileComparisonDimension,
  tileDimension,
  tileBuffers,
  diffBuffers,
}) {
  const tileScale = tileDimension / tileComparisonDimension;
  const numTiles = tileBuffers.length;
  const heightScale = (height / tileComparisonDimension) | 0;
  const widthScale = (width / tileComparisonDimension) | 0;

  const tiles = tileBuffers.map(tileBuffer => (
    nj.uint8(tileBuffer).reshape(tileDimension, tileDimension, 4)
  ));

  const photomosaic = nj.zeros(
    [height * tileScale, width * tileScale, 4],
    'uint8'
  );

  const diffs = nj.zeros([numTiles, heightScale, widthScale], 'float32');

  for (let i = 0; i < numTiles; i++) {
    const diff = nj.float32(diffBuffers[i]).reshape(1, heightScale, widthScale);
    diffs.slice([i, i + 1]).assign(diff, false);
  }

  for (let i = 0; i < height; i += tileComparisonDimension) {
    for (let j = 0; j < width; j += tileComparisonDimension) {
      const si = i / tileComparisonDimension;
      const sj = j / tileComparisonDimension;
      const { selection } = diffs.slice(null, [si, si + 1], [sj, sj + 1]);
      const [tileIndex] = ops.argmin(selection);

      const scaledPhotomosaicI = i * tileScale;
      const scaledPhotomosaicJ = j * tileScale;

      photomosaic
        .slice(
          [scaledPhotomosaicI, scaledPhotomosaicI + tileDimension],
          [scaledPhotomosaicJ, scaledPhotomosaicJ + tileDimension]
        )
        .assign(tiles[tileIndex], false);
    }
  }

  const fullUrl = await computeDataURL(photomosaic.selection.data, {
    width: photomosaic.shape[1],
    height: photomosaic.shape[0],
    quality: 75,
  });

  const displayDimension = 500;

  const displayPhotomosaic = resize(photomosaic.selection.data, {
    width: photomosaic.shape[1],
    height: photomosaic.shape[0],
    newWidth: displayDimension,
    newHeight: displayDimension,
  });

  const displayUrl = await computeDataURL(displayPhotomosaic, {
    width: displayDimension,
    height: displayDimension,
    quality: 60,
  });

  return { fullUrl, displayUrl };
}
