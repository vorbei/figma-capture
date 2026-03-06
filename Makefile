all: capture.js

capture.js:
	curl -o capture.js 'https://mcp.figma.com/mcp/html-to-design/capture.js'
	sed -i '' 's/window\.figma\.captureForDesign=\([a-zA-Z_$$]*\),/window.figma.captureForDesign=\1,window.figma.__clipboardFlow=fn,/' capture.js

clean:
	rm -f capture.js

.PHONY: all clean
