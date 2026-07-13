import ActivityKit
import ExpoModulesCore
import WidgetKit

private let appGroupId = "group.com.siteweave.mobile"
private let snapshotKey = "widgetSnapshot"

public class ReactNativeWidgetExtensionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ReactNativeWidgetExtension")

    Function("setSnapshot") { (json: String) in
      guard let defaults = UserDefaults(suiteName: appGroupId) else { return }
      defaults.set(json, forKey: snapshotKey)
      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadAllTimelines()
      }
    }

    Function("clearSnapshot") {
      guard let defaults = UserDefaults(suiteName: appGroupId) else { return }
      defaults.removeObject(forKey: snapshotKey)
      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadAllTimelines()
      }
    }

    Function("reloadWidgets") {
      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadAllTimelines()
      }
    }

    Function("areActivitiesEnabled") { () -> Bool in
      if #available(iOS 16.2, *) {
        return ActivityAuthorizationInfo().areActivitiesEnabled
      }
      return false
    }

    Function("startActivity") { (_: Int, _: Int, _: Int, _: String) in }
    Function("updateActivity") { (_: Int, _: Int, _: Int, _: String) in }
    Function("endActivity") { (_: Int, _: Int, _: Int, _: String) in }
  }
}
