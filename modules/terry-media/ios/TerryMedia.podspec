Pod::Spec.new do |s|
  s.name           = 'TerryMedia'
  s.version        = '0.1.0'
  s.summary        = 'Montagem, análise e exportação de vídeo do TERRY'
  s.description    = 'AVFoundation: análise de quadros e áudio, composição 9:16 e exportação MP4.'
  s.author         = 'TERRY'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
