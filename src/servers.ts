import {Fontys, FontysServer} from "./Fontys";

import HeraFTPUploader from "./uploaders/hera/HeraFTP";
import HeraDirectAdminUploader from "./uploaders/hera/HeraDirectAdmin";

// Hera
{
    let heraServer = new FontysServer("hera", "The linux-based web host of Fontys.");
    heraServer.registerDefaultUploader(new HeraDirectAdminUploader())
    heraServer.registerUploader(new HeraFTPUploader());
    Fontys.registerServer(heraServer);
}