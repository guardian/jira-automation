let username = process.env.JIRA_USERNAME;
let api_key = process.env.API_KEY;

// convert this token to base64
let formattedToken = `${username}:${api_key}`;
let token = Buffer.from(formattedToken).toString('base64');

let START_DATE_FIELD = "customfield_10816"  // format is YYYY-MM-DD
let DUE_DATE_FIELD = "duedate"              // format is YYYY-MM-DD

async function run() {
  let epics = await fetchAllEpics();
  console.log(`Found ${epics.length} epics`);

  // to save iterating through all epics every time,
  // modify this starting point to be the index of the last epic you processed.
  for (let epicIndex = 0; epicIndex < epics.length; epicIndex++) {
    await applyStartAndEndDatestoAllIssuesInEpic(epics[epicIndex], epicIndex);
  }
}

async function applyStartAndEndDatestoAllIssuesInEpic(epic, epicIndex) {
  let issues = await fetchAllIssuesForEpic(epic);

  // only want issues that are done or otherwise resolved,
  // and that do not already have values for the start date field or due date field
  let relevantIssues = issues.filter(issue => {
    return (issue.fields.status.statusCategory.key === "done" || issue.fields.status.statusCategory.key === "resolved")
        && (!issue.fields[START_DATE_FIELD] && !issue.fields[DUE_DATE_FIELD])
  });

  console.log(`\n\n\[${epicIndex + 1}/${epics.length}]\nEpic ${epic.name} has ${issues.length} issues, and ${relevantIssues.length} of those are relevant`);

  for (let issue of relevantIssues) {
    let { startDate, dueDate } = getDatesFromHistory(issue);
    if (!startDate || !dueDate) {
      console.log(`  ${epic.name}  ⚠️ Either no start change or end date found in history for issue ${issue.key}: ${issue.fields.summary}`);
      continue;
    }
    await updateIssue(issue, startDate, dueDate, epic.name);
  }
}

async function fetchAllIssuesUsingJql(jql) {
  let total = 0; // total results that exist
  let startAt = 0; // where to start
  let maxResults = 50; // fetch this many results
  let issues = [];
  do {
    let url = `https://theguardian.atlassian.net/rest/api/3/search?jql=${jql}&startAt=${startAt}&maxResults=${maxResults}&expand=changelog`;
    let response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${token}`,
        'Accept': 'application/json'
      }
    });
    let responseBody = JSON.parse(await response.text());
    issues = issues.concat(responseBody.issues);
    total = responseBody.total
    startAt = startAt + responseBody.maxResults
  } while (startAt < total);

  return issues;
}

export async function fetchAllIssuesForEpic(epic) {
  const JQL = encodeURIComponent(`"Epic Link" = ${epic.key} ORDER BY created DESC`);
  let issues = await fetchAllIssuesUsingJql(JQL);
  return issues;
}


export async function fetchAllEpics() {
  const JQL = encodeURIComponent(`project = "LIVE" and type = Epic ORDER BY created DESC`);
  const issues = await fetchAllIssuesUsingJql(JQL);
  let epics = issues.map(epic => {
    return {
      key: epic.key,
      name: epic.fields.summary
    }
  });
  return epics;
}

async function updateIssue(issue, startDate, dueDate, epicName) {
  console.log(`  ${issue.key}: ${issue.fields.summary}\n\t⋮⋮⋮ Setting start date to ${startDate} and due date to ${dueDate}...`);
  let body = {
    fields: {
      [START_DATE_FIELD]: startDate,
      [DUE_DATE_FIELD]: dueDate
    }
  }
  let response = await fetch(`https://theguardian.atlassian.net/rest/api/3/issue/${issue.key}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Basic ${token}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (response.status == 204) {
    console.log(`\t\t✅  Successfully set start date to ${startDate} and due date to ${dueDate}`);
  } else {
    console.error(`\t\t❗  Could not update.\n\tStatus code ${response.status}.\n\tBody:\n${await response.text()}`)
    throw "Could not update issue ${issue.key}: ${issue.fields.summary}";
  }
}
function getDatesFromHistory(issue) {
  let statusChanges = issue.changelog.histories.filter(change => {
    return change.items.some(changeItem => changeItem.field === "status");
  }).sort((a, b) => {
    return new Date(a.created) - new Date(b.created);
  }); // first change will be taken, more recent changes should have been separate issues

  let startChange = statusChanges.find(change => {
    return change.items.some(changeItem => changeItem.toString === "In Progress");
  });
  let dueChange = statusChanges.find(change => {
    return change.items.some(changeItem => changeItem.toString === "Done" || changeItem.toString === "Closed");
  });
  if (!startChange || !dueChange) { return { startDate: null, dueDate: null } }
  return {
    startDate: formatDate(startChange.created),
    dueDate: formatDate(dueChange.created)
  }
}

function formatDate(dateString) {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0'); // Add leading zeroes
  const day = String(date.getDate()).padStart(2, '0'); // Add leading zeroes
  const formattedDateString = `${year}-${month}-${day}`;
  return formattedDateString;
}

run().then(_ => console.log("done"));
