# Copying a .swift file into the folder does not build it - Xcode only compiles
# files registered in the project. This adds PedroNative.swift to the App target
# so the on-device model and the native microphone actually make it into the app.
require "xcodeproj"

project_path = "ios/App/App.xcodeproj"
abort("no Xcode project at #{project_path}") unless File.exist?(project_path)

project = Xcodeproj::Project.open(project_path)
target  = project.targets.find { |t| t.name == "App" }
abort("no App target found") unless target

group = project.main_group.find_subpath("App", true)

listed = target.source_build_phase.files.map { |f| f.file_ref && f.file_ref.path }.compact
if listed.any? { |p| p.end_with?("PedroNative.swift") }
  puts "PedroNative.swift is already in the project"
else
  ref = group.new_file("App/PedroNative.swift")
  target.source_build_phase.add_file_reference(ref)
  project.save
  puts "added PedroNative.swift to the App target"
end

final = target.source_build_phase.files.map { |f| f.file_ref && f.file_ref.path }.compact
puts "sources in the target: #{final.join(', ')}"
abort("PedroNative.swift did not get added") unless final.any? { |p| p.end_with?("PedroNative.swift") }
