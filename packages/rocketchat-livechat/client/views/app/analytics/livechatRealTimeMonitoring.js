import moment from 'moment';

const chartContexts = {};			// stores context of current chart, used to clean when redrawing
const LivechatMonitoring = new Mongo.Collection('livechatMonitoring');
let templateInstance;

const initChart = {
	'lc-chats-chart'() {
		return RocketChat.Livechat.Monitoring.drawDoughnutChart(
			document.getElementById('lc-chats-chart'),
			'Chats',
			chartContexts['lc-chats-chart'],
			['Open', 'Queue', 'Closed'], []);
	},

	'lc-agents-chart'() {
		return RocketChat.Livechat.Monitoring.drawDoughnutChart(
			document.getElementById('lc-agents-chart'),
			'Agents',
			chartContexts['lc-agents-chart'],
			['Online', 'Away', 'Busy', 'Offline'], []);
	},

	'lc-chats-per-agent-chart'() {
		return RocketChat.Livechat.Monitoring.drawLineChart(
			document.getElementById('lc-chats-per-agent-chart'),
			chartContexts['lc-chats-per-agent-chart'],
			['Open', 'Closed'],
			[], [[], []]);
	},

	'lc-chats-per-dept-chart'() {
		if (!document.getElementById('lc-chats-per-dept-chart')) {
			return null;
		}

		return RocketChat.Livechat.Monitoring.drawLineChart(
			document.getElementById('lc-chats-per-dept-chart'),
			chartContexts['lc-chats-per-dept-chart'],
			['Open', 'Closed'],
			[], [[], []]);
	},

	'lc-reaction-response-times-chart'() {
		const timingLabels = [];
		const initData = [];
		const today = moment().startOf('day');
		for (let m = today; m.diff(moment(), 'hours') < 0; m.add(1, 'hours')) {
			const hour = m.format('H');
			timingLabels.push(`${ moment(hour, ['H']).format('hA') }-${ moment((parseInt(hour)+1)%24, ['H']).format('hA') }`);
			initData.push(0);
		}

		return RocketChat.Livechat.Monitoring.drawLineChart(
			document.getElementById('lc-reaction-response-times-chart'),
			chartContexts['lc-reaction-response-times-chart'],
			['Avg_reaction_time', 'Longest_reaction_time', 'Avg_response_time', 'Longest_response_time'],
			timingLabels.slice(),
			[initData.slice(), initData.slice(), initData.slice(), initData.slice()]);
	},

	'lc-chat-duration-chart'() {
		const timingLabels = [];
		const initData = [];
		const today = moment().startOf('day');
		for (let m = today; m.diff(moment(), 'hours') < 0; m.add(1, 'hours')) {
			const hour = m.format('H');
			timingLabels.push(`${ moment(hour, ['H']).format('hA') }-${ moment((parseInt(hour)+1)%24, ['H']).format('hA') }`);
			initData.push(0);
		}

		return RocketChat.Livechat.Monitoring.drawLineChart(
			document.getElementById('lc-chat-duration-chart'),
			chartContexts['lc-chat-duration-chart'],
			['Avg_chat_duration', 'Longest_chat_duration'],
			timingLabels.slice(),
			[initData.slice(), initData.slice()]);
	}
};

function updateChart(chartId, label, data) {
	// update chart
	if (!chartContexts[chartId]) {
		chartContexts[chartId] = initChart[chartId]();
	}

	RocketChat.Livechat.Monitoring.updateChart(chartContexts[chartId], label, data);
}

const metricsUpdated = (ts) => {
	const hour = moment(ts).format('H');
	const label = `${ moment(hour, ['H']).format('hA') }-${ moment((parseInt(hour)+1)%24, ['H']).format('hA') }`;

	const query = {
		'ts': {
			$gte: new Date(moment(ts).startOf('hour')),
			$lt: new Date(moment(ts).add(1, 'hours').startOf('hour'))
		}
	};

	const data = RocketChat.Livechat.Monitoring.getChartData(LivechatMonitoring.find(query));

	updateChart('lc-reaction-response-times-chart', label, [data.reaction.avg, data.reaction.longest, data.response.avg, data.response.longest]);
	updateChart('lc-chat-duration-chart', label, [data.chatDuration.avg, data.chatDuration.longest]);
};

const updateDepartmentsChart = (departmentId) => {
	console.log('dpt chart');

	if (departmentId) {
		// update for dept
		const label = LivechatDepartment.findOne({_id: departmentId}).name;

		const data = {
			open: LivechatMonitoring.find({departmentId, open: true}).count(),
			closed: LivechatMonitoring.find({departmentId, open: {$exists: false}}).count()
		};

		updateChart('lc-chats-per-dept-chart', label, [data.open, data.closed]);
	} else {
		// update for all
		LivechatDepartment.find().forEach(function(dept) {
			updateDepartmentsChart(dept._id);
		});
	}
};

const updateAgentsChart = (agent) => {
	if (agent) {
		// update for the agent
		const data = {
			open: LivechatMonitoring.find({'servedBy.username': agent, open: true}).count(),
			closed: LivechatMonitoring.find({'servedBy.username': agent, open: {$exists: false}}).count()
		};

		updateChart('lc-chats-per-agent-chart', agent, [data.open, data.closed]);
	} else {
		// update for all agents
		AgentUsers.find().forEach(function(agent) {
			if (agent.username) {
				updateAgentsChart(agent.username);
			}
		});
	}
};

const updateAgentStatusChart = () => {
	const statusData = RocketChat.Livechat.Monitoring.getAgentStatusData(AgentUsers.find());

	updateChart('lc-agents-chart', 'Offline', [statusData.offline]);
	updateChart('lc-agents-chart', 'Online', [statusData.online]);
	updateChart('lc-agents-chart', 'Away', [statusData.away]);
	updateChart('lc-agents-chart', 'Busy', [statusData.busy]);
};

const updateChatsChart = () => {
	const chats = {
		open: LivechatMonitoring.find({'metrics.chatDuration': {$exists: false}, 'servedBy': {$exists: true}}).count(),
		closed: LivechatMonitoring.find({'metrics.chatDuration': {$exists: true}, 'servedBy': {$exists: true}}).count(),
		queue: LivechatMonitoring.find({'servedBy': {$exists: false}}).count()
	};

	updateChart('lc-chats-chart', 'Open', [chats.open]);
	updateChart('lc-chats-chart', 'Closed', [chats.closed]);
	updateChart('lc-chats-chart', 'Queue', [chats.queue]);
};

function displayDepartmentChart(val) {
	// templateInstance.showDepartmentChart.set(val);
	const elem = document.getElementsByClassName('lc-chats-per-dept-chart-section')[0];
	elem.style.display = (val) ? 'block' : 'none';
}

Template.livechatRealTimeMonitoring.helpers({
	showDepartmentChart() {
		return templateInstance.showDepartmentChart.get();
	}
});

Template.livechatRealTimeMonitoring.onCreated(function() {
	templateInstance = Template.instance();
	// this.showDepartmentChart = new ReactiveVar(false);

	AgentUsers.find().observeChanges({
		changed(/* id, fields */) {
			updateAgentStatusChart();
		},
		added(/* id, fields */) {
			updateAgentStatusChart();
		},
		removed(/* id */) {
			updateAgentStatusChart();
		}
	});

	LivechatDepartment.find().observeChanges({
		changed(id /* , fields */) {
			displayDepartmentChart(true);
			updateDepartmentsChart(id);
		},
		added(id /* , fields */) {
			displayDepartmentChart(true);
			updateDepartmentsChart(id);
		},
		removed(id) {
			if (LivechatDepartment.find().count() === 0) {
				displayDepartmentChart(false);
			}
			updateDepartmentsChart(id);
		}
	});

	LivechatMonitoring.find().observeChanges({
		changed(id, fields) {
			const ts = LivechatMonitoring.findOne({_id: id}).ts;

			if (fields.metrics) {
				// metrics changed
				metricsUpdated(ts);
				updateChatsChart();
			}

			if (fields.servedBy) {
				// agent data changed
				updateAgentsChart(fields.servedBy.username);
				updateChatsChart();
			}

			if (fields.open) {
				updateChatsChart();
			}

			if (fields.departmentId) {
				updateDepartmentsChart(fields.departmentId);
			}
		},
		added(id, fields) {
			const ts = LivechatMonitoring.findOne({_id: id}).ts;

			if (fields.metrics) {
				// metrics changed
				metricsUpdated(ts);
				updateChatsChart();
			}

			if (fields.servedBy) {
				// agent data changed
				updateAgentsChart(fields.servedBy.username);
			}

			if (fields.open) {
				updateChatsChart();
			}

			if (fields.departmentId) {
				updateDepartmentsChart(fields.departmentId);
			}
		},
		removed(id) {
			const ts = LivechatMonitoring.findOne({_id: id}).ts;

			metricsUpdated(ts);
			updateAgentsChart();
			updateChatsChart();
			updateDepartmentsChart();
		}
	});
});

Template.livechatRealTimeMonitoring.onRendered(function() {
	initChart['lc-chats-chart']();
	initChart['lc-agents-chart']();
	initChart['lc-chats-per-agent-chart']();
	initChart['lc-chats-per-dept-chart']();
	initChart['lc-reaction-response-times-chart']();
	initChart['lc-chat-duration-chart']();

	displayDepartmentChart(false);

	this.subscribe('livechat:departments');
	this.subscribe('livechat:agents');
	this.subscribe('livechat:monitoring');
});
