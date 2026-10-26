UUID := ai-usage@guepardosys
SOURCE := $(UUID)
BUILD := build/$(UUID)
GNOME_LIBDIR ?= /usr/lib/gnome-shell
EXTENSIONS_DIR ?= $(HOME)/.local/share/gnome-shell/extensions
.PHONY: build install uninstall pack test test-prefs test-shell check debug enable disable clean
build:
	rm -rf $(BUILD)
	mkdir -p $(BUILD)
	cp -R $(SOURCE)/. $(BUILD)/
	glib-compile-schemas --strict $(BUILD)/schemas
install: build
	mkdir -p "$(EXTENSIONS_DIR)/$(UUID)"
	cp -R $(BUILD)/. "$(EXTENSIONS_DIR)/$(UUID)/"
	@echo "Instalado. Na primeira instalação em Wayland, encerre e entre na sessão; depois make enable."
uninstall:
	-gnome-extensions disable $(UUID)
	rm -rf "$(EXTENSIONS_DIR)/$(UUID)"
pack: build
	mkdir -p dist
	cd $(BUILD) && zip -qr ../../dist/$(UUID).shell-extension.zip .
test: build
	node --test tests/unit.test.mjs
	GSETTINGS_BACKEND=memory gjs -m tests/native.js
test-prefs: build
	GI_TYPELIB_PATH=$(GNOME_LIBDIR)/girepository-1.0 LD_LIBRARY_PATH=$(GNOME_LIBDIR) GSETTINGS_BACKEND=memory gjs -m tests/preferences.js
test-shell: build
	for t in refresh feedback switches notch editor; do python3 tests/shell-$$t.py || exit 1; done
check:
	python3 scripts/check.py
debug:
	journalctl --user -f -o cat /usr/bin/gnome-shell
enable:
	gnome-extensions enable $(UUID)
disable:
	gnome-extensions disable $(UUID)
clean:
	rm -rf build dist
