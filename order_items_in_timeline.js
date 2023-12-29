const fs = require('fs').promises;

let username = process.env.JIRA_USERNAME;
let api_key = process.env.API_KEY;
let session_token = process.env.SESSION_TOKEN;
let jira_csrf = process.env.JIRA_SEC_CSRF;
let jira_user_id = process.env.JIRA_USER_ID
let jira_optimizely_end_user_id = process.env.JIRA_OPTIMIZELY_END_USER_ID
let jira_algolia = process.env.JIRA_ALGOLIA
let jira_xsrf_token = process.env.JIRA_XSRF_TOKEN
let jira_awc_tld_test = process.env.JIRA_AWC_TLD_TEST
let jira_ajs_anonymous_id = process.env.JIRA_AJS_ANONYMOUS_ID
let jira_jsessionid = process.env.JIRA_JSESSIONID
let jira_atl_xid_xc = process.env.JIRA_ATL_XID_XC
let jira_atl_user_hash = process.env.JIRA_ATL_USER_HASH

// convert this token to base64
let formattedToken = `${username}:${api_key}`;
let token = Buffer.from(formattedToken).toString('base64');

let START_DATE_FIELD = "customfield_10816"  // format is YYYY-MM-DD
let DUE_DATE_FIELD = "duedate"              // format is YYYY-MM-DD

/*
* Issue types:
* 10000 = epic
* 10001 = story
* 3 = task
* 1 = bug
* 10100 = spike
* */

async function run() {
    /// this is incredibly inefficient, let's get all epics, get all issues for a given epic,
    /// and use that, much fewer http requests
    // This file was simply copied from the network pane of a browser,
    // when loading the jira timeline view.
    // Search for requests ending in ?operation=roadmapCriticalDataQuery.
    // this doesn't seem to be documented in Jira's API docs, but it's what the UI uses.
    let criticalRoadmapData = JSON.parse(await fs.readFile('roadmapCriticalData.json', 'utf8'));
    const allItems = criticalRoadmapData.data.roadmaps.roadmapForSource.content.items.edges.map(i => i.node)
    console.log(`Found ${allItems.length} items`);
    let epics = allItems.filter(i => i.itemTypeId === "10000");
    console.log(`Found ${epics.length} epics`);
    let issues = allItems.filter(i => i.itemTypeId !== "10000");
    console.log(`Found ${issues.length} issues. Assigning them to the right epics...`);
    for (issue of issues) {
        let epic = epics.find(e => e.id === issue.parentId);
        if (!epic["childIssues"]) epic["childIssues"] = [];
        epic["childIssues"].push(issue);
    }
    // epics = [epics[0]]; // testing only, remove this.
    // epics = epics.filter(i => i.summary == "Audio Experience"); // testing only, remove this.

    for (let i = 0; i < epics.length; i++) {
        let epic = epics[i];
        if (!epic.childIssues) {
            console.log(`[${i+1}/${epics.length}] Epic ${epic.key}: ${epic.summary} has no child issues. Skipping`);
            continue;
        }
        // fetch more info about child, mainly type, status, startdate, duedate.
        // could be more efficient by running a query for all issues in one go. See function in other file.
        console.log(`[${i+1}/${epics.length}] Epic ${epic.key}: ${epic.summary} has ${epic.childIssues.length} child issues. Fetching required information`);
        for (issue of epic.childIssues) {
            let issueData = await getIssue(issue.id);
            issue["type"] = issueData.fields.issuetype.name;
            issue["status"] = issueData.fields.status.name;
            issue["startDate"] = issueData.fields[START_DATE_FIELD];
            issue["dueDate"] = issueData.fields[DUE_DATE_FIELD];
        }
        epic.childIssues = epic.childIssues.map(i => {
            return {
                id: i.id,
                key: i.key,
                summary: i.summary,
                type: i.type,
                status: i.status,
                itemTypeId: i.itemTypeId,
                startDate: i.startDate,
                dueDate: i.dueDate
            }
        });
        epic.childIssues.sort(sortIssues);
        for (let i = 1; i < epic.childIssues.length; i++) {
            // intentionally start at one. Don't bother working out what's currently at the top,
            // just move everything after the first item, and eventually it'll be at the top.
            const issue = epic.childIssues[i];
            const previousIssue = epic.childIssues[i - 1];
            await moveIssueAfterIssue(issue, previousIssue);
            console.log(`Moved issue ${issue.key} after ${previousIssue.key}`)
        }
        console.log(`Finished sorting issues in epic ${epic.key}: ${epic.summary}\n\n`)
    }
}

async function moveIssueAfterIssue(issue, previousIssue) {
    const body = {
        "operationName": "updateRoadmapItemMutation",
        "query": "mutation updateRoadmapItemMutation($sourceARI:ID!,$input:RoadmapUpdateItemInput!){roadmaps{updateRoadmapItem(sourceARI:$sourceARI,input:$input){success,errors{message,extensions{__typename,...on RoadmapMutationErrorExtension{statusCode,errorType}}}}}}",
        "variables": {
            "sourceARI": "ari:cloud:jira-software:75b61526-edee-42e5-a80e-b1e0a2a4a67e:board/43",
            "input": {
                "itemId": issue.id,
                "projectId": "11307",
                "rank": {
                    "id": previousIssue.id,
                    "position": "AFTER"
                }
            }
        }
    };
    const response = await fetch(`https://developer.atlassian.com/gateway/api/graphql`, {
        method: 'POST',
        body:  JSON.stringify(body),
        headers: {
            "authorization": `Basic ${token}`,
            "accept": "application/json",
            "accept-language": "en-GB,en;q=0.6",
            "content-type": "application/json",
            "sec-ch-ua": `"Brave";v="117", "Not;A=Brand";v="8", "Chromium";v="117"`,
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": `"macOS"`,
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "sec-gpc": "1",
            "cookie": `atlCohort={"bucketAll":{"bucketedAtUTC":"2023-07-24T10:12:39.964Z","version":"2","index":57,"bucketId":0}}; _csrf=${jira_csrf}; __aid_user_id=${jira_user_id}; optimizelyEndUserId=${jira_optimizely_end_user_id}; _ALGOLIA=${jira_algolia}; atlassian.account.xsrf.token=${jira_xsrf_token}; __awc_tld_test__=${jira_awc_tld_test}; ajs_anonymous_id=${jira_ajs_anonymous_id}; JSESSIONID=${jira_jsessionid}; atl_xid.xc=${jira_atl_xid_xc}; atlUserHash=${jira_atl_user_hash}; cloud.session.token=${session_token}`,
            "Referer": "https://developer.atlassian.com/platform/atlassian-graphql-api/graphql/explorer/",
            "Referrer-Policy": "strict-origin-when-cross-origin",
            "x-experimentalapi": "ariGraph,boardCardMove,deleteCard,JiraJqlBuilder,SoftwareCardTypeTransitions,jira-releases-v0,JiraDevOps,JiraDevOpsProviders,createCustomFilter,updateCustomFilter,deleteCustomFilter,customFilters,PermissionScheme,JiraIssue,projectStyle,startSprintPrototype,AddIssuesToFixVersion,JiraVersionResult,JiraIssueConnectionJql,JiraFieldOptionSearching,JiraIssueFieldMutations,JiraIssueDevInfoDetails,JiraIssueDevSummaryCache,JiraVersionWarningConfig,JiraReleaseNotesConfiguration,JiraUpdateReleaseNotesConfiguration,ReleaseNotes,ReleaseNotesOptions,DeploymentsFeaturePrecondition,UpdateVersionWarningConfig,UpdateVersionName,UpdateVersionDescription,UpdateVersionStartDate,UpdateVersionReleaseDate,VersionsForProject,RelatedWork,SuggestedRelatedWorkCategories,setIssueMediaVisibility,toggleBoardFeature,DevOpsProvider,DevOpsSummarisedDeployments,virtual-agent-beta,JiraProject,DevOpsSummarisedEntities,RoadmapsMutation,RoadmapsQuery,JiraApplicationProperties,JiraIssueSearch,JiraFilter,featureGroups,setBoardEstimationType,devOps,softwareBoards,name,AddRelatedWorkToVersion,RemoveRelatedWorkFromVersion,admins,canAdministerBoard,jql,globalCardCreateAdditionalFields,GlobalTimeTrackingSettings,ReleaseNotesOptions,search-experience,MoveOrRemoveIssuesToFixVersion,compass-beta,JiraIssueSearchStatus"
        }
    });
    const responseBody = JSON.parse(await response.text());
    return responseBody;
}

function sortIssues(issueA, issueB) {
    if (issueA.startDate && !issueB.startDate) return -1;
    if (!issueA.startDate && issueB.startDate) return 1;
    if (issueA.startDate && issueB.startDate && issueA.startDate < issueB.startDate) return -1;
    if (issueA.startDate && issueB.startDate && issueA.startDate === issueB.startDate) {
        if (issueA.dueDate === issueB.dueDate) {
            if (issueA.status === issueB.status) {
                return issueA.type < issueB.type
            } else {
                if (issueA.status === "Done") return -1;
                if (issueB.status === "Done") return 1;
                if (issueA.status === "In Review") return -1;
                if (issueB.status === "In Review") return 1;
                if (issueA.status === "In Progress") return -1;
                if (issueB.status === "In Progress") return 1;
            }
        } else {
            return issueA < issueB
        }
    } else {
        return issueA < issueB
    }
    if (issueA.status === "Done") return -1;
    if (issueB.status === "Done") return 1;
    if (issueA.status === "Closed") return -1;
    if (issueB.status === "Closed") return 1;
    if (issueA.status === "In Review") return -1;
    if (issueB.status === "In Review") return 1;
    if (issueA.status === "In Progress") return -1;
    if (issueB.status === "In Progress") return 1;
    return 0;
}

async function getIssue(issueId) {
    console.log(`Getting more info about issue ${issueId}`);
    const response = await fetch(`https://theguardian.atlassian.net/rest/agile/1.0/issue/${issueId}`, {
        method: 'GET',
        headers: {
            'Authorization': `Basic ${token}`,
            'Accept': 'application/json'
        }
    });
    let responseBody = JSON.parse(await response.text());
    return responseBody;
}

run().then(_ => console.log("done"));
