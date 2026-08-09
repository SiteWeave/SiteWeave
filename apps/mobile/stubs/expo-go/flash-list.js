/**
 * Expo Go stub: FlashList v2 → FlatList so lists still work without New-Arch-only recycling.
 * Production/dev-client uses real @shopify/flash-list.
 */
import React from 'react';
import { FlatList } from 'react-native';

export const FlashList = React.forwardRef(function FlashListExpoGo(props, ref) {
  const {
    estimatedItemSize: _estimatedItemSize,
    estimatedListSize: _estimatedListSize,
    estimatedFirstItemOffset: _estimatedFirstItemOffset,
    getItemType: _getItemType,
    overrideItemLayout: _overrideItemLayout,
    masonry: _masonry,
    ...rest
  } = props;
  return React.createElement(FlatList, { ...rest, ref });
});

export default FlashList;
