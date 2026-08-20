# Copying a .swift file into the folder does not build it - Xcode only compiles
# files registered in the project. This adds PedroNative.swift to the App target
# so the on-device model and the native microphone actually make it into the app.
require "xcodeproj"

project_path = "ios/App/App.xcodeproj"
abort("no Xcode project at #{project_path}") unless File.exist?(project_path)

# where the file really is - everything below is derived from this, so the
# path Xcode records can never drift from the path on disk
swift_path = File.expand_path("ios/App/App/PedroNative.swift")
abort("PedroNative.swift is not on disk at #{swift_path}") unless File.exist?(swift_path)

project = Xcodeproj::Project.open(project_path)
target  = project.targets.find { |t| t.name == "App" }
abort("no App target found") unless target

group = project.main_group.find_subpath("App", true)

listed = target.source_build_phase.files.map { |f| f.file_ref }.compact
if listed.any? { |r| r.path.to_s.end_with?("PedroNative.swift") }
  puts "PedroNative.swift is already in the project"
else
  # an absolute path lets xcodeproj work out the correct path relative to the
  # group itself - passing a relative one gets appended to the group's own path
  ref = group.new_file(swift_path)
  target.source_build_phase.add_file_reference(ref)
  project.save
  puts "added PedroNative.swift to the App target"
end

# a reference is only useful if it points at the real file, so resolve every
# source in the target back to disk and fail here rather than inside xcodebuild
puts "sources in the App target:"
missing = []
target.source_build_phase.files.each do |f|
  ref = f.file_ref
  next unless ref
  real = begin
    ref.real_path.to_s
  rescue StandardError
    "(unresolvable)"
  end
  ok = File.exist?(real)
  missing << ref.path.to_s unless ok
  puts "  #{ok ? 'ok ' : 'MISSING'} #{ref.path}  ->  #{real}"
end

abort("these sources do not exist on disk: #{missing.join(', ')}") unless missing.empty?

registered = target.source_build_phase.files.map { |f| f.file_ref }.compact
abort("PedroNative.swift did not get added") unless
  registered.any? { |r| r.path.to_s.end_with?("PedroNative.swift") }
puts "PedroNative.swift is registered and resolves to a real file"
