import { Dimensions, PixelRatio } from "react-native";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// iPhone 14 / 15 (390 x 844) を基準にスケール
const BASE_WIDTH = 390;
const BASE_HEIGHT = 844;

/** 横幅基準のスケール（水平方向のサイズ・フォントに使う） */
export function scale(size: number): number {
  return Math.round(PixelRatio.roundToNearestPixel((SCREEN_WIDTH / BASE_WIDTH) * size));
}

/** 縦幅基準のスケール（高さ・縦方向の余白に使う） */
export function verticalScale(size: number): number {
  return Math.round(PixelRatio.roundToNearestPixel((SCREEN_HEIGHT / BASE_HEIGHT) * size));
}

/**
 * スケールを適度に抑えたバージョン（フォントサイズなど過度に大きくしたくない場合）
 * factor: 0 = スケールなし, 1 = フルスケール（デフォルト 0.5）
 */
export function moderateScale(size: number, factor = 0.5): number {
  return Math.round(PixelRatio.roundToNearestPixel(size + (scale(size) - size) * factor));
}

export const screenWidth = SCREEN_WIDTH;
export const screenHeight = SCREEN_HEIGHT;
