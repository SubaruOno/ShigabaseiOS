import { useWindowDimensions } from "react-native";

/** 一覧やフォームを横に伸ばしすぎないための最大幅 */
export const CONTENT_MAX_WIDTH = 760;

/**
 * 画面の広さに応じたレイアウト判定。
 * isWide: iPad横向きやブラウザなど、2列に並べられる幅
 * isLandscape: 横向き（高さが限られるので縦の余白を詰める）
 */
export function useLayout() {
  const { width, height } = useWindowDimensions();
  return {
    width,
    height,
    isWide: width >= 900,
    isLandscape: width > height,
  };
}
