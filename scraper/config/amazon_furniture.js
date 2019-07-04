module.exports = {
    /*
        1. amazon uses image within a to name the category, names are saved as img alt, not a text
        2. amazon generate different link addresses for same page, so has to use name to do the filtering
    */

    landing: {
        url: "https://www.amazon.com/b/ref=s9_acss_bw_cg_HarSofa_3d1_w?node=1063306&pf_rd_m=ATVPDKIKX0DER&pf_rd_s=merchandised-search-2&pf_rd_r=DPE30E26NMKVTAZXX6H5&pf_rd_t=101&pf_rd_p=877c0809-fc53-42a6-91f2-7c8f50e6e9be&pf_rd_i=3733551",
        engine: "superagent",
        headers: {

        },
        jobs: [
            {
                selector: ".acsUxWidget > div > div > div:nth-child(n+2) a",
                parser: "workTpl",
                expectKeys: {
                    gather: {

                    },
                    fanout: {
                        name: "name",
                        url: "url"
                    }
                },
                recursive: true,
                stopselector: "#s-result-info-bar"
            }
        ]
    }
}