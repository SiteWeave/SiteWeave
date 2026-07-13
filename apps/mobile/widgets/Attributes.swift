import ActivityKit
import WidgetKit
import SwiftUI

struct SiteBriefPlaceholderAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var message: String
  }

  var title: String
}
