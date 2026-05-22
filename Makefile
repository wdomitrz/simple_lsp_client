.PHONY: install format format-check lint test compile vsix clean

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

compile:
	npm run compile

vsix:
	npm run package

clean:
	rm -rf dist *.vsix
