.PHONY: install format format-check lint test check compile vsix clean

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

clean:
	rm -rf dist *.vsix
