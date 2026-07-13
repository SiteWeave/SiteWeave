import { useRef } from 'react';
import { TextInput, StyleSheet } from 'react-native';
import { useSheetFocus } from './SheetFocusContext';

export default function SheetInput({ style, onFocus, ...props }) {
  const sheetFocus = useSheetFocus();
  const inputRef = useRef(null);

  const handleFocus = (event) => {
    sheetFocus?.registerFocus?.(props.testID || 'input', inputRef.current);
    onFocus?.(event);
  };

  return (
    <TextInput
      ref={inputRef}
      {...props}
      style={[styles.input, style]}
      onFocus={handleFocus}
    />
  );
}

const styles = StyleSheet.create({
  input: {},
});
