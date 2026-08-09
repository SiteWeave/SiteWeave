import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FloatingTabBar from '../../components/ui/FloatingTabBar';
import AppUpdateBanner from '../../components/AppUpdateBanner';
import { CreateActionProvider } from '../../context/CreateActionContext';
import { NotificationCountProvider } from '../../context/NotificationCountContext';
import { SheetOverlayProvider } from '../../context/SheetOverlayContext';

export const unstable_settings = {
  initialRouteName: 'index',
};

function TabUpdateChrome() {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        position: 'absolute',
        top: insets.top + 4,
        left: 0,
        right: 0,
        zIndex: 20,
      }}
      pointerEvents="box-none"
    >
      <AppUpdateBanner />
    </View>
  );
}

function TabScaffold() {
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        initialRouteName="index"
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          lazy: true,
          freezeOnBlur: true,
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="projects" options={{ title: 'Projects' }} />
        <Tabs.Screen name="calendar" options={{ title: 'Calendar' }} />
        <Tabs.Screen name="more" options={{ title: 'More' }} />
        <Tabs.Screen name="notifications" options={{ href: null }} />
      </Tabs>
      <TabUpdateChrome />
    </View>
  );
}

export default function TabLayout() {
  return (
    <NotificationCountProvider>
      <SheetOverlayProvider>
        <CreateActionProvider>
          <View style={{ flex: 1 }}>
            <TabScaffold />
          </View>
        </CreateActionProvider>
      </SheetOverlayProvider>
    </NotificationCountProvider>
  );
}
