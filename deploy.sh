rm -f homebridge-unipi-*.tgz && npm pack && scp homebridge-unipi-*.tgz m203-sn140.local:
scp config.json m203-sn140.local:.homebridge/config.json
