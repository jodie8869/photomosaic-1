import { createSelector } from 'reselect';
import { TILE_SIZES } from 'config';
import * as fsm from 'fsm';

const PROGRESS_AMOUNT_MAP = {
  [fsm.SELECT_MAIN_IMAGE]: 0,
  [fsm.UPLOADING_MAIN_IMAGE]: 0,
  [fsm.CROP_MAIN_IMAGE]: 33,
  [fsm.SELECT_TILES]: 66,
  [fsm.CREATING_PHOTOMOSAIC]: 100,
  [fsm.DONE]: 100,
};

export function getFsmState(state) {
  return state.fsmState;
}

export const getProgressAmount = createSelector(
  [getFsmState],
  currentState => PROGRESS_AMOUNT_MAP[currentState]
);

export function getMainImageForProcessing(state) {
  return state.mainImageForProcessing;
}

export function getMainImageForCropping(state) {
  return state.mainImageForCropping;
}

export function getTiles(state) {
  return state.tiles;
}

export function getNumTilesUploaded(state) {
  return state.numTilesUploaded;
}

export function getNumTilesUploading(state) {
  return state.numTilesUploading;
}

export const getPercentTilesUploaded = createSelector(
  [getNumTilesUploaded, getNumTilesUploading],

  (numTilesUploaded, numTilesUploading) => {
    if (numTilesUploading === 0) {
      return 0;
    }

    return ((numTilesUploaded / numTilesUploading) * 100) | 0;
  }
);

export function isUploadingTiles(state) {
  return state.uploadingTiles;
}

export const getMainImageCrop = createSelector(
  state => state.mainImageCrop,
  mainImageCrop => ({ ...mainImageCrop, aspect: 1 })
);

export function getPhotomosaic(state) {
  return state.photomosaic;
}

export const getTileSize = createSelector(
  state => state.tileSize,
  key => TILE_SIZES[key],
);

export function getMaxTileSize(state) {
  return state.maxTileSize;
}

export function canSelectMainImage() {
  return true;
}

export const canCropMainImage = createSelector(
  getMainImageForCropping,
  a => !!a
);

export const canSelectTiles = createSelector(
  getMainImageForCropping,
  getMainImageForProcessing,
  getMainImageCrop,
  (a, b, c) => !!(a && b && c)
);

export const canViewPhotomosaic = createSelector(
  canSelectTiles,
  getTiles,
  getPhotomosaic,
  (a, tiles, b) => !!(a && tiles.length > 0 && b)
);
