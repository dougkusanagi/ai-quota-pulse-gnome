import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk?version=4.0';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
export default class AIUsagePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage({title: 'AI Usage', icon_name: 'applications-science-symbolic'});
        const group = new Adw.PreferencesGroup({title: 'Aparência', description: 'As contas são gerenciadas diretamente na aba Configurações do indicador na barra superior.'});
        const formats = ['24h', '12h', 'relative'];
        const format = new Adw.ComboRow({title: 'Formato do reset', model: Gtk.StringList.new(['24 horas', '12 horas', 'Relativo']),
            selected: Math.max(0, formats.indexOf(settings.get_string('reset-format')))});
        format.connect('notify::selected', () => settings.set_string('reset-format', formats[format.selected])); group.add(format);
        const colored = new Adw.SwitchRow({title: 'Barra colorida'}); settings.bind('colored-bars', colored, 'active', 0); group.add(colored);
        const intervals = [1, 5, 10, 15, 30, 60];
        const refresh = new Adw.ComboRow({title: 'Atualizar a cada', model: Gtk.StringList.new(intervals.map(n => `${n} min`)),
            selected: Math.max(0, intervals.indexOf(settings.get_int('refresh-minutes')))});
        refresh.connect('notify::selected', () => settings.set_int('refresh-minutes', intervals[refresh.selected])); group.add(refresh);
        page.add(group); window.add(page); window.set_default_size(540, 430);
    }
}
