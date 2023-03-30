import DirectAdminUploader, {DirectAdminOptions} from "../DirectAdmin";
import {setting} from "../../Fontys";
import IllegalArgumentError from "../../errors/IllegalArgumentError";

const DEFAULT_HERA_FTP_HOST = "https://hera.fhict.nl:2222";
export default class HeraDirectAdminUploader extends DirectAdminUploader<HeraDirectAdminOptions> {
    constructor() {
        super(HeraDirectAdminOptions, DEFAULT_HERA_FTP_HOST);
    }

    async upload(sourcePath: string, targetPath: string, options: HeraDirectAdminOptions): Promise<void> {
        if (options.token) {
            await this.client.verifyToken(options.token);
        } else {
            await this.client.login(options.username, options.password);
        }
        options.logger("Authenticated with the Hera DirectAdmin server as " + options.username + ".");
        if (options.uploadRaw) {
            options.logger("Uploading to root (" + targetPath + ")...");
            await this.client.fileManager.ensureDelete(targetPath);
            await this.client.fileManager.uploadFolder(sourcePath, targetPath);
        } else {
            // Use domain path
            if (options.uploadHttp) {
                options.logger("Uploading to HTTP (/domains/" + options.domain + "/public_html/" + targetPath + ")...");
                await this.client.fileManager.ensureDelete("/domains/" + options.domain + "/public_html/" + targetPath);
                await this.client.fileManager.uploadFolder(sourcePath, "/domains/" + options.domain + "/public_html/" + targetPath);
            }
            if (options.uploadHttps) {
                options.logger("Uploading to HTTPS (/domains/" + options.domain + "/private_html/" + targetPath + ")...");
                await this.client.fileManager.ensureDelete("/domains/" + options.domain + "/private_html/" + targetPath);
                await this.client.fileManager.uploadFolder(sourcePath, "/domains/" + options.domain + "/private_html/" + targetPath);
            }
        }
    }
}
export class HeraDirectAdminOptions extends DirectAdminOptions {
    @setting({
        description: "The domain to use on the Hera server. Defaults to \"iXXXXXX.hera.fhict.nl\" where iXXXXXX is your username."
    })
    domain: string;
    @setting({
        description: "If present, the file(s) will be uploaded to the root folder of the FTP server. You should probably use --uploadHttp and/or --uploadHttps instead. If this flag is present, --uploadHttp and --uploadHttps will be ignored.",
        default: false,
        parser: setting.flag
    })
    uploadRaw: boolean;
    @setting({
        description: "Whether to upload the file to the HTTP endpoint (domain/iXXXXXX.hera.fhict.nl/public_html) or not (true/false).",
        default: true,
        parser: setting.boolean
    })
    uploadHttp: boolean;
    @setting({
        description: "Whether to upload the file to the secure HTTPS endpoint (domain/iXXXXXX.hera.fhict.nl/private_html) or not (true/false).",
        default: true,
        parser: setting.boolean
    })
    uploadHttps: boolean;

    constructor(logger: (message) => void, data: any) {
        super(logger, data);
        if (!this.domain) {
            this.domain = this.username + ".hera.fhict.nl";
        }
        if (!this.uploadHttp && !this.uploadHttps) {
            throw new IllegalArgumentError("--uploadHttp and --uploadHttps is both set to false! Not uploading anything.");
        }
    }
}