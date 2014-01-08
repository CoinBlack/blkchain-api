'use strict';

//Setting up route
angular.module('mystery').config(['$routeProvider',
  function($routeProvider) {
    $routeProvider.
    when('/', {
      templateUrl: 'views/index.html'
    }).
    when('/blocks', {
      templateUrl: 'views/blocks/list.html'
    }).
    when('/blocks-date/:blockDate', {
      templateUrl: 'views/blocks/list_date.html'
    }).
    otherwise({
      redirectTo: '/'
    });
  }
]);

//Setting HTML5 Location Mode
angular.module('mystery').config(['$locationProvider',
  function($locationProvider) {
    $locationProvider.hashPrefix('!');
  }
]);
