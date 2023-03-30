import IllegalArgumentError from "./errors/IllegalArgumentError";

export const Fontys = new class Fontys {
    private readonly servers = new Map<string, FontysServer>();
    private readonly serverNameList: string[] = [];
    private readonly serverList: FontysServer[] = [];
    registerServer(server: FontysServer) {
        if (!this.servers.has(server.name)) {
            this.serverNameList.push(server.name);
            this.serverList.push(server);
        } else {
            this.serverList.splice(this.serverNameList.indexOf(server.name), 1, server);
        }
        this.servers.set(server.name, server);
    }
    doesServerExist(key: string) {
        return this.servers.has(key);
    }
    getServer(key: string) {
        return this.servers.get(key);
    }

    getServerNames() {
        return this.serverNameList;
    }
    getServers() {
        return this.serverList;
    }
}
export class FontysServer {
    readonly name: string;
    readonly description: string;
    private readonly uploaderMap: Map<string, FontysUploader<any>>;
    private readonly uploaderNameList: string[];
    private readonly uploaderList: FontysUploader<any>[];
    constructor(name: string, description: string) {
        this.name = name;
        this.description = description;
        this.uploaderMap = new Map();
        this.uploaderNameList = [];
        this.uploaderList = [];
    }
    registerUploader(uploader: FontysUploader<any>) {
        if (!this.uploaderMap.has(uploader.name)) {
            this.uploaderNameList.push(uploader.name);
            this.uploaderList.push(uploader);
        } else {
            this.uploaderList.splice(this.uploaderNameList.indexOf(uploader.name), 1, uploader);
        }
        this.uploaderMap.set(uploader.name, uploader);
    }
    registerDefaultUploader(uploader: FontysUploader<any>) {
        this.registerUploader(uploader);
        this.uploaderMap.set(null, uploader);
    }
    getUploader(key: string|null): FontysUploader<any>|null {
        return this.uploaderMap.get(key);
    }
    getDefaultUploader(): FontysUploader<any> {
        return this.uploaderMap.get(null);
    }

    getUploaderNames() {
        return this.uploaderNameList;
    }
    getUploaders() {
        return this.uploaderList;
    }
}
export interface Constructor<T> {
    new(...args: any[]): T;
}
export abstract class FontysUploader<Options extends UploadOptions> {
    readonly name: string;
    protected readonly optionsConstructor: Constructor<Options>;
    protected constructor(name: string, optionsConstructor: Constructor<Options>) {
        this.name = name;
        this.optionsConstructor = optionsConstructor;
    }

    getOptions(): UploaderSetting<any>[] {
        return this.optionsConstructor["settings"];
    }
    public parseOptions(logger: (message)=>void, data: any): Options {
        return new this.optionsConstructor(logger, data);
    }
    public abstract upload(sourcePath: string, targetPath: string, options?: Options): Promise<void>;
}
interface UploaderSetting<T> {
    name: string,
    description: string,
    required?: boolean,
    default?: T,
    aliases?: string[],
    parser?: (str)=>T
}
export function setting(setting: Omit<UploaderSetting<any>, "name">) {
    return function (proto: any, propName: string) {
        if (!proto.constructor.settings) {
            proto.constructor.settings = [];
            proto.constructor.settingMap = new Map();
        }
        let fixed = setting as UploaderSetting<any>;
        fixed.name = propName;
        if (!fixed.required) {
            // If it's not present, this will run
            fixed.required = false;
        }
        /*
        if (fixed.default) {
            fixed.description += " Defaults to: ";
            if (typeof fixed.default == "string") {
                fixed.description += "\"" + fixed.default + "\"";
            } else {
                fixed.description += fixed.default;
            }
        }
        */
        if (!fixed.aliases) fixed.aliases = [];
        if (!fixed.parser) fixed.parser = (s)=>s;

        if (proto.constructor.settingMap.has(propName)) {
            // The property has been remapped, remove it
            let index = proto.constructor.settingMap.get(propName);
            proto.constructor.settings.splice(index, 1, fixed);
        } else {
            let index = proto.constructor.settings.push(fixed) - 1;
            proto.constructor.settingMap.set(propName, index);
        }
    }
}
setting["int"] = (str)=>parseInt(str);
setting["float"] = (str)=>parseFloat(str);
setting["flag"] = ()=>true;
setting["boolean"] = (str)=>{
    if (str == "true") {
        return true;
    } else if (str == "false") {
        return false;
    } else {
        throw new IllegalArgumentError(str + " is not a valid boolean value!");
    }
}
export class UploadOptions {
    /**
     * A function for logging strings. By default, this will log
     * to the console, but this can be modified with commandline
     * options.
     */
    logger: (message)=>void;

    constructor(logger: (message)=>void, data: any) {
        this.logger = logger;
        let settings = this.constructor["settings"] as UploaderSetting<any>[];
        for (let setting of settings) {
            let source: string;
            if (Object.hasOwn(data, setting.name)) {
                source = data[setting.name];
            } else {
                let found = false;
                for (let alias of setting.aliases) {
                    if (Object.hasOwn(data, alias)) {
                        source = data[alias];
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    if (setting.required) {
                        throw new IllegalArgumentError("Argument \"" + setting.name + "\" is required, but is not present.");
                    }
                    this[setting.name] = setting.default;
                    continue;
                }
            }
            this[setting.name] = setting.parser(source);
        }
    }
}