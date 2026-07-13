import Foundation

struct WidgetSnapshot: Codable {
  struct Sync: Codable {
    var isOnline: Bool?
    var pendingCount: Int?
  }

  struct KPIs: Codable {
    var dueToday: Int?
    var overdue: Int?
    var unreadNotifications: Int?
    var activeProjects: Int?
    var completedTasks: Int?
  }

  struct Weather: Codable {
    var tempF: Int?
    var condition: String?
    var precipPct: Int?
    var locationLabel: String?
    var riskLevel: String?
  }

  struct PinnedProject: Codable {
    var id: String?
    var name: String?
    var progressPct: Int?
  }

  struct MyDayItem: Codable, Identifiable {
    var type: String?
    var itemId: String?
    var title: String?
    var time: String?
    var status: String?
    var statusLabel: String?
    var deepLink: String?

    var id: String { itemId ?? "\(type ?? "item")-\(title ?? UUID().uuidString)" }

    enum CodingKeys: String, CodingKey {
      case type, title, time, status, statusLabel, deepLink
      case itemId = "id"
    }
  }

  var version: Int?
  var updatedAt: String?
  var state: String?
  var experienceMode: String?
  var sync: Sync?
  var kpis: KPIs?
  var weather: Weather?
  var pinnedProject: PinnedProject?
  var myDay: [MyDayItem]?
  var primaryColor: String?
  var deepLink: String?
}

enum WidgetSnapshotStore {
  static let appGroupId = "group.com.siteweave.mobile"
  static let snapshotKey = "widgetSnapshot"

  static func load() -> WidgetSnapshot? {
    guard let defaults = UserDefaults(suiteName: appGroupId),
          let json = defaults.string(forKey: snapshotKey),
          let data = json.data(using: .utf8) else {
      return nil
    }
    return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
  }
}

func widgetHeadline(_ snapshot: WidgetSnapshot?) -> String {
  guard let snapshot else { return "SiteWeave" }
  if snapshot.state == "logged_out" { return "Sign in to SiteWeave" }
  if snapshot.state == "offline" { return "Offline" }
  if let name = snapshot.pinnedProject?.name, !name.isEmpty { return name }
  return "SiteWeave"
}

func widgetSubhead(_ snapshot: WidgetSnapshot?) -> String {
  guard let snapshot else { return "Open app to sync" }
  if snapshot.state == "logged_out" { return "Open SiteWeave to sign in" }
  if snapshot.state == "empty" { return "Nothing due today" }

  var parts: [String] = []
  if let due = snapshot.kpis?.dueToday, due > 0 { parts.append("\(due) due") }
  if let overdue = snapshot.kpis?.overdue, overdue > 0 { parts.append("\(overdue) overdue") }
  if parts.isEmpty { return "All clear today" }
  return parts.joined(separator: " · ")
}

func weatherLine(_ snapshot: WidgetSnapshot?) -> String? {
  guard let weather = snapshot?.weather, let temp = weather.tempF else { return nil }
  var line = "\(temp)°"
  if let condition = weather.condition, !condition.isEmpty {
    line += " \(condition)"
  }
  if let precip = weather.precipPct {
    line += " · \(precip)%"
  }
  return line
}

func staleLabel(_ updatedAt: String?) -> String? {
  guard let updatedAt,
        let date = ISO8601DateFormatter().date(from: updatedAt) else { return nil }
  let minutes = max(1, Int(Date().timeIntervalSince(date) / 60))
  if minutes < 60 { return "Updated \(minutes)m ago" }
  let hours = max(1, minutes / 60)
  if hours < 24 { return "Updated \(hours)h ago" }
  return "Updated \(hours / 24)d ago"
}

func footerLine(_ snapshot: WidgetSnapshot?) -> String {
  guard let snapshot else { return "SiteWeave" }
  var parts: [String] = []
  if snapshot.state == "offline", let pending = snapshot.sync?.pendingCount, pending > 0 {
    parts.append("\(pending) pending")
  }
  if let unread = snapshot.kpis?.unreadNotifications, unread > 0 {
    parts.append("\(unread) unread")
  }
  if let stale = staleLabel(snapshot.updatedAt) {
    parts.append(stale)
  }
  return parts.isEmpty ? (staleLabel(snapshot.updatedAt) ?? "SiteWeave") : parts.joined(separator: " · ")
}

struct SiteBriefWidgetEntry: TimelineEntry {
  let date: Date
  let snapshot: WidgetSnapshot?
}

struct SiteBriefProvider: TimelineProvider {
  func placeholder(in context: Context) -> SiteBriefWidgetEntry {
    SiteBriefWidgetEntry(date: Date(), snapshot: nil)
  }

  func getSnapshot(in context: Context, completion: @escaping (SiteBriefWidgetEntry) -> Void) {
    completion(SiteBriefWidgetEntry(date: Date(), snapshot: WidgetSnapshotStore.load()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<SiteBriefWidgetEntry>) -> Void) {
    let entry = SiteBriefWidgetEntry(date: Date(), snapshot: WidgetSnapshotStore.load())
    let next = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date().addingTimeInterval(1800)
    completion(Timeline(entries: [entry], policy: .after(next)))
  }
}

struct SiteBriefMediumView: View {
  let snapshot: WidgetSnapshot?

  var body: some View {
    let deepLink = URL(string: snapshot?.deepLink ?? "siteweave:///(tabs)")
    let accent = Color(hex: snapshot?.primaryColor ?? "#3B82F6")

    VStack(alignment: .leading, spacing: 8) {
      HStack(alignment: .top) {
        VStack(alignment: .leading, spacing: 2) {
          Text(widgetHeadline(snapshot))
            .font(.headline)
            .lineLimit(1)
          Text(widgetSubhead(snapshot))
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
        Spacer()
        if let weather = weatherLine(snapshot) {
          Text(weather)
            .font(.caption2)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.trailing)
        }
      }

      Divider()

      if let items = snapshot?.myDay, !items.isEmpty {
        ForEach(items.prefix(3)) { item in
          HStack {
            Text("• \(item.title ?? "Item")")
              .font(.subheadline)
              .lineLimit(1)
            Spacer()
            Text(item.type == "event" ? (item.time ?? "") : (item.statusLabel ?? ""))
              .font(.caption)
              .foregroundStyle((item.status ?? "").contains("overdue") ? Color.red : Color.secondary)
          }
        }
      } else {
        Text(snapshot?.state == "logged_out" ? "Tap to sign in" : "Your day is clear")
          .font(.subheadline)
          .foregroundStyle(.secondary)
      }

      Spacer(minLength: 0)

      HStack {
        Text(footerLine(snapshot))
          .font(.caption2)
          .foregroundStyle(.secondary)
          .lineLimit(1)
        Spacer()
        Text("Log site day")
          .font(.caption.weight(.semibold))
          .foregroundStyle(accent)
      }
    }
    .padding(14)
    .widgetURL(deepLink)
  }
}

struct SiteBriefSmallView: View {
  let snapshot: WidgetSnapshot?

  var body: some View {
    let deepLink = URL(string: snapshot?.deepLink ?? "siteweave:///(tabs)")
    let due = snapshot?.kpis?.dueToday ?? 0
    let overdue = snapshot?.kpis?.overdue ?? 0

    VStack(alignment: .leading, spacing: 4) {
      if snapshot?.state == "logged_out" {
        Text("Sign in")
          .font(.headline)
        Text("Tap to open")
          .font(.caption)
          .foregroundStyle(.secondary)
      } else {
        Text("\(due) due · \(overdue) overdue")
          .font(.headline)
          .lineLimit(1)
        if let weather = weatherLine(snapshot) {
          Text(weather)
            .font(.caption)
            .foregroundStyle(Color(hex: snapshot?.primaryColor ?? "#3B82F6"))
            .lineLimit(2)
        } else {
          Text(snapshot?.pinnedProject?.name ?? "Site brief")
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(2)
        }
      }
    }
    .padding(12)
    .widgetURL(deepLink)
  }
}

struct SiteBriefWidget: Widget {
  let kind: String = "SiteBriefWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: SiteBriefProvider()) { entry in
      if #available(iOS 17.0, *) {
        SiteBriefMediumView(snapshot: entry.snapshot)
          .containerBackground(.fill.tertiary, for: .widget)
      } else {
        SiteBriefMediumView(snapshot: entry.snapshot)
          .padding()
          .background()
      }
    }
    .configurationDisplayName("Site Brief")
    .description("Today's tasks, weather, and overdue alerts.")
    .supportedFamilies([.systemMedium])
  }
}

struct SiteBriefSmallWidget: Widget {
  let kind: String = "SiteBriefSmallWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: SiteBriefProvider()) { entry in
      if #available(iOS 17.0, *) {
        SiteBriefSmallView(snapshot: entry.snapshot)
          .containerBackground(.fill.tertiary, for: .widget)
      } else {
        SiteBriefSmallView(snapshot: entry.snapshot)
          .padding()
          .background()
      }
    }
    .configurationDisplayName("Site Brief Compact")
    .description("Due counts and weather at a glance.")
    .supportedFamilies([.systemSmall])
  }
}

extension Color {
  init(hex: String) {
    let cleaned = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
    var int: UInt64 = 0
    Scanner(string: cleaned).scanHexInt64(&int)
    let r, g, b: UInt64
    switch cleaned.count {
    case 6:
      (r, g, b) = ((int >> 16) & 0xFF, (int >> 8) & 0xFF, int & 0xFF)
    default:
      (r, g, b) = (59, 130, 246)
    }
    self.init(.sRGB, red: Double(r) / 255, green: Double(g) / 255, blue: Double(b) / 255, opacity: 1)
  }
}
