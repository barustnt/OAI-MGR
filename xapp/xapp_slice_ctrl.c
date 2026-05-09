/*
 * xapp_slice_ctrl.c
 * FlexRIC xApp — 3-slice STATIC PRB control
 *
 * Supports: embb | urllc | mmtc
 *
 * Usage:
 *   ./xapp_slice_ctrl --speed embb
 *   ./xapp_slice_ctrl --speed urllc
 *   ./xapp_slice_ctrl --speed mmtc
 *
 * PRB mapping (106-PRB config, STATIC algorithm):
 *   embb  (SST=1): pos_low=0, pos_high=10  (~80% PRBs)
 *   urllc (SST=2): pos_low=0, pos_high=5   (~40% PRBs)
 *   mmtc  (SST=3): pos_low=0, pos_high=2   (~15% PRBs)
 *
 * --speed is stripped before passing argv to init_fr_args()
 * so FlexRIC's getopt never sees it.
 */

#include "../../../../src/xApp/e42_xapp_api.h"
#include "../../../../src/util/alg_ds/alg/defer.h"
#include "../../../../src/util/time_now_us.h"
#include "../../../../src/sm/slice_sm/slice_sm_id.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#define SLICE_ID    0
#define SLICE_LABEL "oai-mgr"
#define DL_SCHED    "PF"
#define UL_SCHED    "round_robin_ul"

typedef struct {
    const char* name;
    int         sst;
    uint32_t    pos_low;
    uint32_t    pos_high;
    int         prb_pct;
    const char* description;
} slice_profile_t;

static const slice_profile_t PROFILES[] = {
    { "embb",  1,  0, 10, 80, "eMBB — Enhanced Mobile Broadband"    },
    { "urllc", 2,  0,  5, 40, "URLLC — Ultra-Reliable Low Latency"  },
    { "mmtc",  3,  0,  2, 15, "mMTC — Massive Machine Type Comms"   },
    /* Legacy aliases */
    { "high",  1,  0, 10, 80, "HIGH (alias for embb)"               },
    { "low",   3,  0,  2, 15, "LOW (alias for mmtc)"                },
};
static const int N_PROFILES = 5;

static void sm_cb_slice(sm_ag_if_rd_t const* rd) { (void)rd; }

static int send_slice_ctrl(e2_node_connected_xapp_t* node,
                            const slice_profile_t* p)
{
    printf("[oai-slice] Applying %s (SST=%d): "
           "pos_low=%u pos_high=%u (~%d%% PRBs)\n",
           p->name, p->sst, p->pos_low, p->pos_high, p->prb_pct);

    slice_ctrl_req_data_t ctrl = {0};
    ctrl.msg.type = SLICE_CTRL_SM_V0_ADD;

    /* DL */
    ul_dl_slice_conf_t* dl = &ctrl.msg.u.add_mod_slice.dl;
    dl->len_sched_name = strlen(DL_SCHED);
    dl->sched_name = malloc(dl->len_sched_name);
    memcpy(dl->sched_name, DL_SCHED, dl->len_sched_name);
    dl->len_slices = 1;
    dl->slices = calloc(1, sizeof(fr_slice_t));

    fr_slice_t* s = &dl->slices[0];
    s->id = SLICE_ID;
    s->len_label = strlen(SLICE_LABEL);
    s->label = malloc(s->len_label);
    memcpy(s->label, SLICE_LABEL, s->len_label);
    s->len_sched = strlen(DL_SCHED);
    s->sched = malloc(s->len_sched);
    memcpy(s->sched, DL_SCHED, s->len_sched);
    s->params.type           = SLICE_ALG_SM_V0_STATIC;
    s->params.u.sta.pos_low  = p->pos_low;
    s->params.u.sta.pos_high = p->pos_high;

    /* UL */
    ul_dl_slice_conf_t* ul = &ctrl.msg.u.add_mod_slice.ul;
    ul->len_sched_name = strlen(UL_SCHED);
    ul->sched_name = malloc(ul->len_sched_name);
    memcpy(ul->sched_name, UL_SCHED, ul->len_sched_name);
    ul->len_slices = 0;

    control_sm_xapp_api(&node->id, SM_SLICE_ID, &ctrl);
    free_slice_ctrl_msg(&ctrl.msg);
    printf("[oai-slice] Slice control sent OK\n");
    return 0;
}

int main(int argc, char* argv[])
{
    /* Strip --speed <value> before passing to FlexRIC */
    const char* speed = NULL;
    char* fargs[64];
    int   fargc = 0;

    for (int i = 0; i < argc && fargc < 63; i++) {
        if (strcmp(argv[i], "--speed") == 0 && i + 1 < argc) {
            speed = argv[++i];
        } else {
            fargs[fargc++] = argv[i];
        }
    }
    fargs[fargc] = NULL;

    if (!speed) {
        fprintf(stderr,
            "Usage: %s --speed <embb|urllc|mmtc|high|low>\n"
            "  embb  (SST=1) ~80%% PRBs — Enhanced Mobile Broadband\n"
            "  urllc (SST=2) ~40%% PRBs — Ultra-Reliable Low Latency\n"
            "  mmtc  (SST=3) ~15%% PRBs — Massive Machine Type Comms\n",
            argv[0]);
        return 1;
    }

    const slice_profile_t* profile = NULL;
    for (int i = 0; i < N_PROFILES; i++) {
        if (strcasecmp(PROFILES[i].name, speed) == 0) {
            profile = &PROFILES[i];
            break;
        }
    }
    if (!profile) {
        fprintf(stderr, "Unknown slice '%s'. Use: embb urllc mmtc\n", speed);
        return 1;
    }

    printf("[oai-slice] %s — %s\n", profile->name, profile->description);

    /* Init FlexRIC xApp */
    fr_args_t args = init_fr_args(fargc, fargs);
    init_xapp_api(&args);
    sleep(1);

    e2_node_arr_xapp_t nodes = e2_nodes_xapp_api();
    defer({ free_e2_node_arr_xapp(&nodes); });

    if (nodes.len == 0) {
        fprintf(stderr, "[oai-slice] ERROR: No E2 nodes connected to RIC\n");
        while (try_stop_xapp_api() == false) usleep(1000);
        return 2;
    }
    printf("[oai-slice] Found %d E2 node(s)\n", nodes.len);

    /* Subscribe then control */
    sm_ans_xapp_t* handles = calloc(nodes.len, sizeof(sm_ans_xapp_t));
    for (int i = 0; i < nodes.len; i++)
        handles[i] = report_sm_xapp_api(
            &nodes.n[i].id, SM_SLICE_ID, (void*)"5_ms", sm_cb_slice);
    sleep(2);

    int ret = 0;
    for (int i = 0; i < nodes.len; i++) {
        ret = send_slice_ctrl(&nodes.n[i], profile);
        if (ret != 0) break;
        sleep(1);
    }

    for (int i = 0; i < nodes.len; i++)
        rm_report_sm_xapp_api(handles[i].u.handle);
    free(handles);
    sleep(1);
    while (try_stop_xapp_api() == false) usleep(1000);

    printf(ret == 0 ? "[oai-slice] SUCCESS\n" : "[oai-slice] FAILED\n");
    return ret;
}
