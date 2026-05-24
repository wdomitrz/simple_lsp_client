.PHONY: install format format-check lint test check compile vsix publish publish-open-vsx clean

install:
	npm install

format:
	npm run format

format-check:
	npm run format:check

lint:
	npm run lint

test:
	npm test

check: format-check lint test

compile:
	npm run compile

vsix: clean
	npm run package

publish: check
	npm run publish:extension

publish-open-vsx: check vsix
	npm run publish:open-vsx -- --packagePath *.vsix

clean:
	rm -rf dist *.vsix
