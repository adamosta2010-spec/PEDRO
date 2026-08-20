# Copying a .swift file into the folder does not build it - Xcode only compiles
# files registered in the project. These two carry the on-device model, the
# native microphone, and the registration that makes the plugin reachable.
require "xcodeproj"

project_path = "ios/App/App.xcodeproj"
abort("no Xcode project at #{project_path}") unless File.exist?(project_path)

FILES = ["PedroNative.swift", "MainViewController.swift"]

project = Xcodeproj::Project.open(project_path)
target  = project.targets.find { |t| t.name == "App" }
abort("no App target found") unless target
group = project.main_group.find_subpath("App", true)

FILES.each do |name|
  swift_path = File.expand_path("ios/App/App/#{name}")
  abort("#{name} is not on disk at #{swift_path}") unless File.exist?(swift_path)

  listed = target.source_build_phase.files.map { |f| f.file_ref }.compact
  if listed.any? { |r| r.path.to_s.end_with?(name) }
    puts "#{name} is already in the project"
    next
  end
  # an absolute path lets xcodeproj work out the path relative to the group -
  # a relative one gets appended to the group's own path and points nowhere
  ref = group.new_file(swift_path)
  target.source_build_phase.add_file_reference(ref)
  puts "added #{name} to the App target"
end
project.save

# a reference is only useful if it points at a real file, so resolve every
# source back to disk and fail here rather than inside xcodebuild
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
FILES.each do |name|
  abort("#{name} did not get added") unless registered.any? { |r| r.path.to_s.end_with?(name) }
end
puts "both Swift files are registered and resolve to real files"
