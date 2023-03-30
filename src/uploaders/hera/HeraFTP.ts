import {setting} from "../../Fontys";
import FTPUploader, {FTPOptions} from "../FTP";
import UploadError from "../../errors/UploadError";
import * as ftp from "basic-ftp";
import * as fs from "fs";
import IllegalArgumentError from "../../errors/IllegalArgumentError";

const DEFAULT_HERA_FTP_HOST = "hera.fhict.nl";
export default class HeraFTPUploader extends FTPUploader<HeraFTPOptions> {
    constructor() {
        super(HeraFTPOptions);
    }
    cannotConnect(host, port, error) {
        throw new UploadError("Could not establish a connection to \"" + host + ":" + port + "\". The Fontys HERA server only allows FTP connections originating from within Fontys. Are you sure you're running this in Fontys, or that you're connected to the VPN?", error);
    }

    async upload(sourcePath: string, targetPath: string, options?: HeraFTPOptions) {
        let client = new ftp.Client();
        await this.connectClient(client, options);
        options.logger("Connected.")

        if (options.uploadRaw) {
            options.logger("Uploading to root (" + targetPath + ")...");
            await this.uploadImpl(client, sourcePath, targetPath);
        } else {
            // Use domain path
            await client.cd("domains/" + options.domain);
            if (options.uploadHttp) {
                options.logger("Uploading to HTTP (domains/" + options.domain + "/public_html/" + targetPath + ")...");
                await this.uploadImpl(client, sourcePath, "public_html/" + targetPath);
                await client.cdup();
            }
            if (options.uploadHttps) {
                options.logger("Uploading to HTTPS (domains/" + options.domain + "/private_html/" + targetPath + ")...");
                await this.uploadImpl(client, sourcePath, "private_html/" + targetPath);
                await client.cdup();
            }
        }

        options.logger((fs.statSync(sourcePath).isDirectory() ? "Directory" : "File") + " uploaded.")
        await client.close();
    }
}
export class HeraFTPOptions extends FTPOptions {
    @setting({
        description: "The host to connect to.",
        default: DEFAULT_HERA_FTP_HOST
    })
    declare ftpHost: string;
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